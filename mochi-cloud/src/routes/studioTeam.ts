// Team Create gateway for Mochi Studio drafts.
//
// REST: enable/disable a session, invite creators, change roles, revoke access
// and list drafts shared with the caller. The WebSocket route authenticates a
// query-string token (browsers cannot set headers on a socket) and forwards the
// request to the per-draft Durable Object with verified identity headers.

import { Hono, Context } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware, verifyToken } from '../middleware/auth';
import { findStudioDraftById, listSharedStudioDrafts, StudioDraftRecord } from '../services/draftDb';
import { findUserByIdentifier } from '../services/userDb';
import {
  CollabRole,
  StudioCollaborator,
  TeamSession,
  findCollaborator,
  getTeamSession,
  isTeamEnabled,
  listCollaborators,
  removeCollaborator,
  setTeamSession,
  upsertCollaborator
} from '../services/studioCollabDb';

type Ctx = Context<{ Bindings: MochiEnv; Variables: AppVariables }>;
type TeamRole = 'owner' | CollabRole;

interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface DraftAccess {
  draft: StudioDraftRecord;
  role: TeamRole;
}

export const studioTeamRouter = new Hono<{ Bindings: MochiEnv; Variables: AppVariables }>();

async function loadDraftAccess(env: MochiEnv, id: string, user: SessionUser): Promise<DraftAccess | null> {
  const draft = await findStudioDraftById(env.DB, id);
  if (!draft) return null;
  if (draft.creatorId === user.id || user.role === 'admin') return { draft, role: 'owner' };
  const granted = await findCollaborator(env.DB, id, user.id);
  if (!granted) return null;
  return { draft, role: granted === 'viewer' ? 'viewer' : 'editor' };
}

function userOf(c: Ctx): SessionUser | null {
  return (c.get('user') as SessionUser | undefined) || null;
}

function isRole(value: unknown): value is CollabRole {
  return value === 'editor' || value === 'viewer';
}

async function teamPayload(env: MochiEnv, id: string, access: DraftAccess) {
  const session: TeamSession | null = await getTeamSession(env.DB, id);
  const members: StudioCollaborator[] = await listCollaborators(env.DB, id);
  return {
    draftId: id,
    ownerId: access.draft.creatorId,
    role: access.role,
    enabled: Boolean(session?.enabled),
    members,
    websocketPath: `/api/v1/games/drafts/${encodeURIComponent(id)}/team/ws`
  };
}

/** Best-effort eviction of a live socket after an access change. */
async function notifyRevoke(env: MochiEnv, draftId: string, userId: string): Promise<void> {
  const namespace = env.STUDIO_DRAFT;
  if (!namespace || typeof namespace.idFromName !== 'function') return;
  try {
    const stub = namespace.get(namespace.idFromName(`draft/${draftId}`));
    await stub.fetch(new Request('https://draft.internal/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }));
  } catch {
    // The room may be evicted or the binding unavailable; D1 is authoritative.
  }
}

// GET /api/v1/games/drafts/shared - drafts where the caller is a collaborator
studioTeamRouter.get('/shared', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const drafts = await listSharedStudioDrafts(c.env.DB, user.id);
  const withRoles = await Promise.all(drafts.map(async (draft) => ({
    ...draft,
    accessRole: (await findCollaborator(c.env.DB, draft.id, user.id)) || 'editor'
  })));
  return c.json({ drafts: withRoles, total: withRoles.length }, 200);
});

// GET /api/v1/games/drafts/:id/team - status, role and member list
studioTeamRouter.get('/:id/team', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  if (!user || !id) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  return c.json({ team: await teamPayload(c.env, id, access) }, 200);
});

// POST /api/v1/games/drafts/:id/team - owner enables or pauses Team Create
studioTeamRouter.post('/:id/team', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  if (!user || !id) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  if (access.role !== 'owner') return c.json({ error: 'Only the draft owner can manage Team Create' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'enabled must be a boolean' }, 400);
  await setTeamSession(c.env.DB, id, access.draft.creatorId, body.enabled);
  if (!body.enabled) await notifyRevoke(c.env, id, '*');
  return c.json({ team: await teamPayload(c.env, id, access) }, 200);
});

// GET /api/v1/games/drafts/:id/team/members - anyone with access can see the team
studioTeamRouter.get('/:id/team/members', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  if (!user || !id) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  const members = await listCollaborators(c.env.DB, id);
  return c.json({ members, total: members.length }, 200);
});

// POST /api/v1/games/drafts/:id/team/members - invite by username or user id
studioTeamRouter.post('/:id/team/members', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  if (!user || !id) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  if (access.role !== 'owner') return c.json({ error: 'Only the draft owner can invite collaborators' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as { username?: unknown; userId?: unknown; role?: unknown };
  const identifier = typeof body.userId === 'string' ? body.userId : typeof body.username === 'string' ? body.username : '';
  if (!identifier.trim()) return c.json({ error: 'username or userId is required' }, 400);
  const invitee = await findUserByIdentifier(c.env.DB, identifier.trim());
  if (!invitee) return c.json({ error: 'User not found' }, 404);
  if (invitee.id === access.draft.creatorId) return c.json({ error: 'The owner is already on the team' }, 400);
  const role: CollabRole = isRole(body.role) ? body.role : 'editor';
  await upsertCollaborator(c.env.DB, id, invitee.id, role, user.id);
  const members = await listCollaborators(c.env.DB, id);
  return c.json({ member: members.find((m) => m.userId === invitee.id) || null, members }, 201);
});

// PATCH /api/v1/games/drafts/:id/team/members/:userId - change editor/viewer
studioTeamRouter.patch('/:id/team/members/:userId', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  const targetId = c.req.param('userId');
  if (!user || !id || !targetId) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  if (access.role !== 'owner') return c.json({ error: 'Only the draft owner can change roles' }, 403);
  if (!await findCollaborator(c.env.DB, id, targetId)) return c.json({ error: 'Collaborator not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { role?: unknown };
  if (!isRole(body.role)) return c.json({ error: 'role must be editor or viewer' }, 400);
  await upsertCollaborator(c.env.DB, id, targetId, body.role, user.id);
  await notifyRevoke(c.env, id, targetId);
  return c.json({ members: await listCollaborators(c.env.DB, id) }, 200);
});

// DELETE /api/v1/games/drafts/:id/team/members/:userId - revoke immediately
studioTeamRouter.delete('/:id/team/members/:userId', authMiddleware, async (c: Ctx) => {
  const user = userOf(c);
  const id = c.req.param('id');
  const targetId = c.req.param('userId');
  if (!user || !id || !targetId) return c.json({ error: 'Unauthorized' }, 401);
  const access = await loadDraftAccess(c.env, id, user);
  if (!access) return c.json({ error: 'Draft not found or access denied' }, 404);
  if (access.role !== 'owner') return c.json({ error: 'Only the draft owner can remove collaborators' }, 403);
  await removeCollaborator(c.env.DB, id, targetId);
  await notifyRevoke(c.env, id, targetId);
  return c.json({ success: true, removedId: targetId }, 200);
});

// GET /api/v1/games/drafts/:id/team/ws - authenticated live editing socket
studioTeamRouter.get('/:id/team/ws', async (c: Ctx) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Draft ID is required' }, 400);
  const upgrade = c.req.header('Upgrade');
  if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected Upgrade: websocket header' }, 426);
  }
  const headerToken = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  const token = c.req.query('token') || headerToken;
  const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
  const identity = token ? await verifyToken<SessionUser>(token, secret) : null;
  if (!identity || !identity.id) return c.json({ error: 'Unauthorized' }, 401);

  const access = await loadDraftAccess(c.env, id, identity);
  if (!access) return c.json({ error: 'Forbidden: no collaborator access to this draft' }, 403);
  if (!await isTeamEnabled(c.env.DB, id)) {
    return c.json({ error: 'Team Create is not enabled for this draft' }, 409);
  }
  if (!c.env.STUDIO_DRAFT) {
    return c.json({ error: 'Durable Object namespace STUDIO_DRAFT is not available' }, 503);
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-mochi-user-id', identity.id);
  headers.set('x-mochi-user-name', identity.username || 'Creator');
  headers.set('x-mochi-user-role', identity.role || 'user');
  const forwarded = new Request(c.req.raw, { headers });
  const namespace = c.env.STUDIO_DRAFT;
  const stub = namespace.get(namespace.idFromName(`draft/${id}`));
  return stub.fetch(forwarded);
});
