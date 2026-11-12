// Team Create: REST gateway, collaborator grants, session switch and the
// authenticated WebSocket upgrade path.

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createTeamMockDb } from './mockTeamDb';
import { MochiEnv } from '../src/types/env';
import {
  findCollaborator,
  getTeamSession,
  isTeamEnabled,
  listCollaborators,
  removeCollaborator,
  setTeamSession,
  upsertCollaborator
} from '../src/services/studioCollabDb';

interface AuthResult {
  token: string;
  user: { id: string; username: string };
}

interface TeamState {
  draftId: string;
  ownerId: string;
  role: 'owner' | 'editor' | 'viewer';
  enabled: boolean;
  members: { userId: string; username: string; role: string }[];
  websocketPath: string;
}

async function register(env: MochiEnv, username: string, email: string): Promise<AuthResult> {
  await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password: 'password123', displayName: username })
  }, env);
  const otp = await env.DB
    .prepare('SELECT code FROM email_verification_otps WHERE email = ?')
    .bind(email)
    .first<{ code: string }>();
  const res = await app.request('/api/v1/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: otp!.code })
  }, env);
  expect(res.status).toBe(200);
  return (await res.json()) as AuthResult;
}

function jsonRequest(method: string, token: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };
}

async function createDraft(env: MochiEnv, token: string): Promise<string> {
  const res = await app.request('/api/v1/games/drafts', jsonRequest('POST', token, {
    title: 'Team Map',
    manifestJson: JSON.stringify({ objects: [], scriptCode: 'print(1)' })
  }), env);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { draft: { id: string } };
  return body.draft.id;
}

describe('Team Create REST gateway', () => {
  let env: MochiEnv;
  let owner: AuthResult;
  let guest: AuthResult;
  let draftId: string;

  beforeEach(async () => {
    env = {
      DB: createTeamMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
    owner = await register(env, 'team_owner', 'owner@mochi.dev');
    guest = await register(env, 'team_guest', 'guest@mochi.dev');
    draftId = await createDraft(env, owner.token);
  });

  it('rejects unauthenticated team requests', async () => {
    const res = await app.request(`/api/v1/games/drafts/${draftId}/team`, { method: 'GET' }, env);
    expect(res.status).toBe(401);
    const shared = await app.request('/api/v1/games/drafts/shared', { method: 'GET' }, env);
    expect(shared.status).toBe(401);
  });

  it('keeps a draft private until an invite exists', async () => {
    const team = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('GET', guest.token), env
    );
    expect(team.status).toBe(404);
    const shared = await app.request(
      '/api/v1/games/drafts/shared', jsonRequest('GET', guest.token), env
    );
    expect(shared.status).toBe(200);
    expect((await shared.json()) as { total: number }).toEqual({ drafts: [], total: 0 });
  });

  it('lets only the owner enable, pause and validate the session switch', async () => {
    const bad = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('POST', owner.token, { enabled: 'yes' }), env
    );
    expect(bad.status).toBe(400);

    const enabled = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('POST', owner.token, { enabled: true }), env
    );
    expect(enabled.status).toBe(200);
    const state = ((await enabled.json()) as { team: TeamState }).team;
    expect(state.enabled).toBe(true);
    expect(state.role).toBe('owner');
    expect(state.ownerId).toBe(owner.user.id);
    expect(state.websocketPath).toContain('/team/ws');

    const paused = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('POST', owner.token, { enabled: false }), env
    );
    expect(((await paused.json()) as { team: TeamState }).team.enabled).toBe(false);
  });

  it('runs the full invite, role change, shared list and revoke lifecycle', async () => {
    const invited = await app.request(
      `/api/v1/games/drafts/${draftId}/team/members`,
      jsonRequest('POST', owner.token, { username: 'team_guest', role: 'editor' }), env
    );
    expect(invited.status).toBe(201);
    const inviteBody = (await invited.json()) as {
      member: { userId: string; username: string; role: string };
      members: { userId: string }[];
    };
    expect(inviteBody.member.userId).toBe(guest.user.id);
    expect(inviteBody.member.username).toBe('team_guest');
    expect(inviteBody.members).toHaveLength(1);

    const shared = await app.request(
      '/api/v1/games/drafts/shared', jsonRequest('GET', guest.token), env
    );
    const sharedBody = (await shared.json()) as {
      drafts: { id: string; accessRole: string }[];
      total: number;
    };
    expect(sharedBody.total).toBe(1);
    expect(sharedBody.drafts[0].id).toBe(draftId);
    expect(sharedBody.drafts[0].accessRole).toBe('editor');

    const guestTeam = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('GET', guest.token), env
    );
    expect(((await guestTeam.json()) as { team: TeamState }).team.role).toBe('editor');

    const forbidden = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('POST', guest.token, { enabled: true }), env
    );
    expect(forbidden.status).toBe(403);

    const changed = await app.request(
      `/api/v1/games/drafts/${draftId}/team/members/${guest.user.id}`,
      jsonRequest('PATCH', owner.token, { role: 'viewer' }), env
    );
    expect(changed.status).toBe(200);
    expect(((await changed.json()) as { members: { role: string }[] }).members[0].role).toBe('viewer');

    const invalidRole = await app.request(
      `/api/v1/games/drafts/${draftId}/team/members/${guest.user.id}`,
      jsonRequest('PATCH', owner.token, { role: 'owner' }), env
    );
    expect(invalidRole.status).toBe(400);

    const removed = await app.request(
      `/api/v1/games/drafts/${draftId}/team/members/${guest.user.id}`,
      jsonRequest('DELETE', owner.token), env
    );
    expect(removed.status).toBe(200);
    const after = await app.request(
      `/api/v1/games/drafts/${draftId}/team`, jsonRequest('GET', guest.token), env
    );
    expect(after.status).toBe(404);
  });

  it('allows editors to save shared drafts but never transfers ownership', async () => {
    const payload = {
      id: draftId,
      title: 'Edited by guest',
      manifestJson: JSON.stringify({ objects: [], scriptCode: 'print(2)' })
    };
    const denied = await app.request(
      '/api/v1/games/drafts', jsonRequest('POST', guest.token, payload), env
    );
    expect(denied.status).toBe(403);

    await upsertCollaborator(env.DB, draftId, guest.user.id, 'editor', owner.user.id);
    const read = await app.request(
      `/api/v1/games/drafts/${draftId}`, jsonRequest('GET', guest.token), env
    );
    expect(read.status).toBe(200);
    const saved = await app.request(
      '/api/v1/games/drafts', jsonRequest('POST', guest.token, payload), env
    );
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { draft: { creatorId: string } }).draft.creatorId)
      .toBe(owner.user.id);

    await upsertCollaborator(env.DB, draftId, guest.user.id, 'viewer', owner.user.id);
    const viewerWrite = await app.request(
      '/api/v1/games/drafts', jsonRequest('POST', guest.token, payload), env
    );
    expect(viewerWrite.status).toBe(403);
  });

  it('guards the WebSocket upgrade with header, token and session checks', async () => {
    const path = `/api/v1/games/drafts/${draftId}/team/ws?token=${owner.token}`;
    const noUpgrade = await app.request(path, { method: 'GET' }, env);
    expect(noUpgrade.status).toBe(426);

    const noToken = await app.request(
      `/api/v1/games/drafts/${draftId}/team/ws`,
      { method: 'GET', headers: { Upgrade: 'websocket' } }, env
    );
    expect(noToken.status).toBe(401);

    const paused = await app.request(path, {
      method: 'GET', headers: { Upgrade: 'websocket' }
    }, env);
    expect(paused.status).toBe(409);

    await setTeamSession(env.DB, draftId, owner.user.id, true);
    const noBinding = await app.request(path, {
      method: 'GET', headers: { Upgrade: 'websocket' }
    }, env);
    expect(noBinding.status).toBe(503);
  });

  it('persists session state and collaborator grants at the D1 service layer', async () => {
    expect(await getTeamSession(env.DB, draftId)).toBeNull();
    expect(await isTeamEnabled(env.DB, draftId)).toBe(false);

    const first = await setTeamSession(env.DB, draftId, owner.user.id, true);
    expect(first.enabled).toBe(true);
    expect(await isTeamEnabled(env.DB, draftId)).toBe(true);
    const second = await setTeamSession(env.DB, draftId, owner.user.id, false);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.enabled).toBe(false);

    expect(await findCollaborator(env.DB, draftId, guest.user.id)).toBeNull();
    await upsertCollaborator(env.DB, draftId, guest.user.id, 'viewer', owner.user.id);
    expect(await findCollaborator(env.DB, draftId, guest.user.id)).toBe('viewer');
    expect((await listCollaborators(env.DB, draftId))[0].username).toBe('team_guest');
    await removeCollaborator(env.DB, draftId, guest.user.id);
    expect(await listCollaborators(env.DB, draftId)).toEqual([]);
  });
});
