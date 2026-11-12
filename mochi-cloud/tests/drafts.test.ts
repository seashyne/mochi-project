// Milestone 3 Unit Tests: Studio Project Drafts Persistence, D1 Database, and Hono API

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createDraftMockDb } from './mockDraftDb';
import { MochiEnv } from '../src/types/env';
import {
  saveStudioDraft,
  findStudioDraftById,
  listStudioDraftsByCreator,
  deleteStudioDraft,
  StudioDraftRecord
} from '../src/services/draftDb';

describe('Studio Project Drafts Persistence API', () => {
  let env: MochiEnv;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;

  async function registerUser(username: string, email: string) {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: 'password123', displayName: username })
    }, env);

    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(email).first<{ code: string }>();

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp!.code })
    }, env);

    return (await verifyRes.json()) as { token: string; user: { id: string } };
  }

  beforeEach(async () => {
    env = {
      DB: createDraftMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };

    const u1 = await registerUser('creator_one', 'c1@mochi.dev');
    user1Token = u1.token;
    user1Id = u1.user.id;

    const u2 = await registerUser('creator_two', 'c2@mochi.dev');
    user2Token = u2.token;
  });

  it('rejects unauthenticated requests to draft endpoints', async () => {
    const res = await app.request('/api/v1/games/drafts/mine', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('validates title and manifestJson syntax', async () => {
    const noTitle = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ title: '', manifestJson: '{}' })
    }, env);
    expect(noTitle.status).toBe(400);

    const invalidJson = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ title: 'My Draft', manifestJson: 'not-valid-json' })
    }, env);
    expect(invalidJson.status).toBe(400);
  });

  it('rejects manifest payloads exceeding the 16MB draft ceiling', async () => {
    const hugePayload = JSON.stringify({ data: 'A'.repeat(17 * 1024 * 1024) });
    const res = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ title: 'Large Draft', manifestJson: hugePayload })
    }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('16MB');
  });

  it('moves manifests above 64KB into R2 and hydrates them on read', async () => {
    const objects = new Map<string, string>();
    env.ASSETS = {
      put: async (key: string, value: string) => {
        objects.set(key, value);
        return {} as R2Object;
      },
      get: async (key: string) =>
        objects.has(key)
          ? ({ text: async () => objects.get(key) as string } as R2ObjectBody)
          : null,
      head: async (key: string) =>
        objects.has(key) ? ({ key } as R2Object) : null
    } as unknown as R2Bucket;

    const largeManifest = JSON.stringify({ data: 'A'.repeat(70 * 1024) });
    const res = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ title: 'Pointer Draft', manifestJson: largeManifest })
    }, env);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { draft: StudioDraftRecord };
    expect(created.draft.manifestJson).toBe(largeManifest);
    expect(created.draft.manifestKey).toMatch(/^drafts\/sha256\/[a-f0-9]{64}$/);
    expect(created.draft.manifestSize).toBeGreaterThan(64 * 1024);
    expect(objects.size).toBe(1);

    const read = await app.request(`/api/v1/games/drafts/${created.draft.id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${user1Token}` }
    }, env);
    expect(read.status).toBe(200);
    const hydrated = (await read.json()) as { draft: StudioDraftRecord };
    expect(hydrated.draft.manifestJson).toBe(largeManifest);
  });

  it('saves, retrieves, updates, and lists project drafts for owner', async () => {
    const manifest = JSON.stringify({ objects: [], script: 'print("test")' });

    // 1. Create draft
    const createRes = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        title: 'Sky Obby v1',
        slug: 'sky-obby-v1',
        description: 'Floating island obby',
        manifestJson: manifest,
        versionNumber: '0.1.0'
      })
    }, env);
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { draft: StudioDraftRecord };
    const draftId = createBody.draft.id;
    expect(draftId).toBeDefined();
    expect(createBody.draft.title).toBe('Sky Obby v1');

    // 2. Fetch by ID
    const getRes = await app.request(`/api/v1/games/drafts/${draftId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${user1Token}` }
    }, env);
    expect(getRes.status).toBe(200);

    // 3. Update existing draft
    const updateRes = await app.request('/api/v1/games/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        id: draftId,
        title: 'Sky Obby v2 Updated',
        manifestJson: manifest,
        versionNumber: '0.2.0'
      })
    }, env);
    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as { draft: StudioDraftRecord };
    expect(updateBody.draft.title).toBe('Sky Obby v2 Updated');

    // 4. List my drafts
    const listRes = await app.request('/api/v1/games/drafts/mine', {
      method: 'GET',
      headers: { Authorization: `Bearer ${user1Token}` }
    }, env);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { drafts: StudioDraftRecord[]; total: number };
    expect(listBody.total).toBe(1);
    expect(listBody.drafts[0].title).toBe('Sky Obby v2 Updated');

    // 5. User 2 cannot access user 1's draft
    const user2Get = await app.request(`/api/v1/games/drafts/${draftId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${user2Token}` }
    }, env);
    expect(user2Get.status).toBe(403);

    // 6. Delete draft
    const delRes = await app.request(`/api/v1/games/drafts/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` }
    }, env);
    expect(delRes.status).toBe(200);

    // 7. Post-delete lookup returns 404
    const notFound = await app.request(`/api/v1/games/drafts/${draftId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${user1Token}` }
    }, env);
    expect(notFound.status).toBe(404);
  });

  it('direct draftDb service methods function correctly', async () => {
    const record: StudioDraftRecord = {
      id: 'd_test_1',
      creatorId: user1Id,
      gameId: null,
      title: 'Direct DB Test',
      description: null,
      slug: null,
      manifestJson: '{"test":true}',
      manifestKey: null,
      manifestHash: null,
      manifestSize: null,
      versionNumber: '0.1.0',
      isAutosave: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await saveStudioDraft(env.DB, record);
    expect(saved.id).toBe('d_test_1');

    const found = await findStudioDraftById(env.DB, 'd_test_1');
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Direct DB Test');

    const list = await listStudioDraftsByCreator(env.DB, user1Id);
    expect(list.length).toBeGreaterThan(0);

    const deleted = await deleteStudioDraft(env.DB, 'd_test_1', user1Id);
    expect(deleted).toBe(true);

    const afterDel = await findStudioDraftById(env.DB, 'd_test_1');
    expect(afterDel).toBeNull();
  });
});
