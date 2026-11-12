// Files REST API: auth, folder tree, ownership, visibility, built-in protection

import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { createFileMockDb } from './mockFileDb';
import { MochiEnv } from '../src/types/env';
import { registerFile, type AssetFileRecord } from '../src/services/fileDb';

describe('files registry API', () => {
  let env: MochiEnv;
  let token1: string;
  let id1: string;
  let token2: string;

  async function registerUser(username: string, email: string) {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: 'password123', displayName: username })
    }, env);
    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(email).first<{ code: string }>();
    const res = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp!.code })
    }, env);
    return (await res.json()) as { token: string; user: { id: string } };
  }

  const auth = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
  const call = (path: string, method: string, token: string, body?: unknown) =>
    app.request(`/api/v1/files${path}`, { method, headers: auth(token), body: body === undefined ? undefined : JSON.stringify(body) }, env);

  async function makeFolder(name: string, token = token1, parentId?: string) {
    const res = await call('/folders', 'POST', token, { name, parentId });
    return ((await res.json()) as { folder: { id: string } }).folder;
  }

  const seedFile = (id: string, ownerId: string, overrides: Partial<AssetFileRecord> = {}) =>
    registerFile(env.DB, {
      id, ownerId, folderId: null, name: `${id}.glb`, kind: 'model',
      objectKey: `assets/sha256/${id.padEnd(64, 'b')}`, hash: id.padEnd(64, 'b'),
      sizeBytes: 10, contentType: 'model/gltf-binary', visibility: 'private',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides
    });

  beforeEach(async () => {
    env = {
      DB: createFileMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
    const u1 = await registerUser('creator_one', 'c1@mochi.dev');
    token1 = u1.token; id1 = u1.user.id;
    token2 = (await registerUser('creator_two', 'c2@mochi.dev')).token;
  });

  it('rejects unauthenticated requests', async () => {
    for (const [path, method] of [['/', 'GET'], ['/folders', 'GET'], ['/folders', 'POST'], ['/x', 'PATCH'], ['/x', 'DELETE']] as const) {
      const res = await app.request(`/api/v1/files${path}`, { method }, env);
      expect(res.status).toBe(401);
    }
  });

  it('manages a folder tree with validation and ownership', async () => {
    expect((await call('/folders', 'POST', token1, { name: '  ' })).status).toBe(400);
    const root = await makeFolder('Models');
    const child = await makeFolder('Trees', token1, root.id);
    const thirdRes = await call('/folders', 'POST', token1, { name: 'X', parentId: root.id });
    expect(thirdRes.status).toBe(201);
    const thirdId = ((await thirdRes.json()) as { folder: { id: string } }).folder.id;
    expect((await call('/folders', 'POST', token2, { name: 'Steal', parentId: root.id })).status).toBe(404);

    const list = await (await call('/folders', 'GET', token1)).json() as { folders: { id: string }[] };
    expect(list.folders.map(f => f.id).sort()).toEqual([root.id, child.id, thirdId].sort());

    expect((await call(`/folders/${root.id}`, 'PATCH', token2, { name: 'Hacked' })).status).toBe(403);
    expect((await call(`/folders/${root.id}`, 'PATCH', token1, { name: 'Renamed' })).status).toBe(200);
    expect((await call(`/folders/${root.id}`, 'DELETE', token2)).status).toBe(403);
    expect((await call(`/folders/${root.id}`, 'DELETE', token1)).status).toBe(200);
    const after = await (await call('/folders', 'GET', token1)).json() as { folders: unknown[] };
    expect(after.folders).toHaveLength(0);
  });

  it('limits folder nesting depth', async () => {
    let parentId: string | undefined;
    for (let i = 0; i < 8; i++) parentId = (await makeFolder(`level-${i}`, token1, parentId)).id;
    expect((await call('/folders', 'POST', token1, { name: 'too-deep', parentId })).status).toBe(400);
  });

  it('lists files with folder, kind, search and pagination filters', async () => {
    const folder = await makeFolder('Models');
    await seedFile('f1', id1, { name: 'Oak Tree.glb', updatedAt: '2026-01-03' });
    await seedFile('f2', id1, { name: 'Pine.glb', folderId: folder.id, updatedAt: '2026-01-02' });
    await seedFile('f3', id1, { name: 'song.mp3', kind: 'audio', contentType: 'audio/mpeg', updatedAt: '2026-01-01' });
    await seedFile('f4', 'someone-else', { name: 'Oak Tree.glb' });

    const all = await (await call('', 'GET', token1)).json() as { files: { id: string }[] };
    expect(all.files.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
    const root = await (await call('?folder=root', 'GET', token1)).json() as { files: { id: string }[] };
    expect(root.files.map(f => f.id)).toEqual(['f1', 'f3']);
    const inFolder = await (await call(`?folder=${folder.id}`, 'GET', token1)).json() as { files: { id: string }[] };
    expect(inFolder.files.map(f => f.id)).toEqual(['f2']);
    expect((await call(`?folder=${folder.id}`, 'GET', token2)).status).toBe(404);
    const audio = await (await call('?kind=audio', 'GET', token1)).json() as { files: { id: string }[] };
    expect(audio.files.map(f => f.id)).toEqual(['f3']);
    expect((await call('?kind=bogus', 'GET', token1)).status).toBe(400);
    const search = await (await call('?search=tree', 'GET', token1)).json() as { files: { id: string }[] };
    expect(search.files.map(f => f.id)).toEqual(['f1']);
    const page = await (await call('?limit=1&offset=1', 'GET', token1)).json() as { files: { id: string }[] };
    expect(page.files.map(f => f.id)).toEqual(['f2']);
  });

  it('enforces visibility on file reads', async () => {
    await seedFile('priv', id1);
    await seedFile('unl', id1, { visibility: 'unlisted' });
    await seedFile('pub', id1, { visibility: 'public' });
    expect((await call('/priv', 'GET', token1)).status).toBe(200);
    expect((await call('/priv', 'GET', token2)).status).toBe(403);
    expect((await call('/unl', 'GET', token2)).status).toBe(200);
    expect((await call('/pub', 'GET', token2)).status).toBe(200);
    expect((await call('/missing', 'GET', token1)).status).toBe(404);
  });

  it('updates name, folder and visibility with validation', async () => {
    const folder = await makeFolder('Models');
    await seedFile('f1', id1);
    expect((await call('/f1', 'PATCH', token2, { name: 'Hacked' })).status).toBe(403);
    expect((await call('/f1', 'PATCH', token1, {})).status).toBe(400);
    expect((await call('/f1', 'PATCH', token1, { visibility: 'secret' })).status).toBe(400);
    expect((await call('/f1', 'PATCH', token1, { name: 'x'.repeat(121) })).status).toBe(400);
    expect((await call('/f1', 'PATCH', token1, { folderId: 'missing' })).status).toBe(404);
    const ok = await call('/f1', 'PATCH', token1, { name: 'Renamed', folderId: folder.id, visibility: 'public' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ file: { name: 'Renamed', folderId: folder.id, visibility: 'public' } });
    expect((await call('/f1', 'PATCH', token1, { folderId: null })).status).toBe(200);
  });

  it('protects built-in system assets from mutation', async () => {
    await seedFile('builtin', 'system', { visibility: 'public' });
    expect((await call('/builtin', 'GET', token2)).status).toBe(200);
    expect((await call('/builtin', 'PATCH', token1, { name: 'Hacked' })).status).toBe(403);
    expect((await call('/builtin', 'DELETE', token1)).status).toBe(403);
  });

  it('deletes registry entries only for the owner', async () => {
    await seedFile('f1', id1);
    expect((await call('/f1', 'DELETE', token2)).status).toBe(403);
    expect((await call('/missing', 'DELETE', token1)).status).toBe(404);
    expect((await call('/f1', 'DELETE', token1)).status).toBe(200);
    expect((await call('/f1', 'GET', token1)).status).toBe(404);
  });
});