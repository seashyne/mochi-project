// Upload registration and registry-gated asset serving

import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { MochiEnv } from '../src/types/env';
import { createFileMockDb } from './mockFileDb';
import { findFilesByObjectKey, registerFile } from '../src/services/fileDb';
import { sha256Hex } from '../src/services/sha256';

const CONTENT = 'binary-model-bytes';

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ReadableStream) return new Uint8Array(await new Response(value).arrayBuffer());
  throw new Error('Unsupported body');
}

class AccessBucket {
  objects = new Map<string, { data: Uint8Array; contentType: string }>();
  private uploads = new Map<string, { key: string; contentType: string; parts: Map<number, Uint8Array> }>();

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? ({ key, size: object.data.length, etag: 'e' } as unknown as R2Object) : null;
  }
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const object = this.objects.get(key);
    if (!object) return null;
    const data = options?.range
      ? object.data.slice(options.range.offset, options.range.offset + options.range.length)
      : object.data;
    return {
      body: new Response(data).body, size: object.data.length, etag: 'e', httpEtag: '"e"',
      httpMetadata: { contentType: object.contentType }
    } as unknown as R2ObjectBody;
  }
  async put(key: string, value: unknown, options?: R2PutOptions) {
    const data = await toBytes(value);
    this.objects.set(key, { data, contentType: (options?.httpMetadata as { contentType?: string } | undefined)?.contentType || 'application/octet-stream' });
    return { key, size: data.length } as unknown as R2Object;
  }
  async delete(key: string) { this.objects.delete(key); }
  async createMultipartUpload(key: string, options?: R2MultipartOptions) {
    const uploadId = crypto.randomUUID();
    this.uploads.set(uploadId, {
      key, parts: new Map(),
      contentType: (options?.httpMetadata as { contentType?: string })?.contentType || 'application/octet-stream'
    });
    return this.resumeMultipartUpload(key, uploadId);
  }
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const record = this.uploads.get(uploadId)!;
    return {
      key, uploadId,
      uploadPart: async (partNumber: number, value: unknown) => {
        record.parts.set(partNumber, await toBytes(value));
        return { partNumber, etag: `etag-${partNumber}` };
      },
      complete: async (parts: R2UploadedPart[]) => {
        const chunks = parts.map(p => record.parts.get(p.partNumber)!);
        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        this.objects.set(key, { data: merged, contentType: record.contentType });
        this.uploads.delete(uploadId);
        return { key, size: merged.length, etag: 'complete-etag' } as unknown as R2Object;
      },
      abort: async () => { this.uploads.delete(uploadId); }
    } as R2MultipartUpload;
  }
}

describe('upload registration and access-gated serving', () => {
  let env: MochiEnv;
  let bucket: AccessBucket;
  let token1: string;
  let id1: string;
  let token2: string;

  async function registerUser(username: string, email: string) {
    await app.request('/api/v1/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: 'password123', displayName: username })
    }, env);
    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(email).first<{ code: string }>();
    const res = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp!.code })
    }, env);
    return (await res.json()) as { token: string; user: { id: string } };
  }

  const serve = (key: string, headers: Record<string, string> = {}) =>
    app.request(`/api/v1/assets/file/${key}`, { method: 'GET', headers }, env);

  beforeEach(async () => {
    bucket = new AccessBucket();
    env = {
      DB: createFileMockDb(),
      ASSETS: bucket as unknown as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
    const u1 = await registerUser('owner_one', 'o1@mochi.dev');
    token1 = u1.token; id1 = u1.user.id;
    token2 = (await registerUser('owner_two', 'o2@mochi.dev')).token;
  });

  it('registers completed multipart uploads and deduplicates re-uploads', async () => {
    const bytes = new TextEncoder().encode(CONTENT);
    const sha = sha256Hex(bytes);
    const createBody = { filename: 'tree.glb', contentType: 'model/gltf-binary', sizeBytes: bytes.length, sha256: sha };
    const create = await app.request('/api/v1/assets/multipart/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
      body: JSON.stringify(createBody)
    }, env);
    const created = await create.json() as { assetKey: string; uploadId: string; uploadToken: string; totalParts: number };
    expect(create.status).toBe(200);

    const part = await app.request(`/api/v1/assets/multipart/part?key=${created.assetKey}&uploadId=${created.uploadId}&partNumber=1`, {
      method: 'PUT', headers: { 'X-Upload-Token': created.uploadToken }, body: bytes
    }, env);
    expect(part.status).toBe(200);
    const { etag } = await part.json() as { etag: string };

    const complete = await app.request(`/api/v1/assets/multipart/complete?key=${created.assetKey}&uploadId=${created.uploadId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Token': created.uploadToken },
      body: JSON.stringify({ parts: [{ partNumber: 1, etag }] })
    }, env);
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ registered: true, hashVerified: true });

    const rows = await findFilesByObjectKey(env.DB, created.assetKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: id1, name: 'tree.glb', kind: 'model', visibility: 'private', hash: sha });

    const again = await app.request('/api/v1/assets/multipart/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
      body: JSON.stringify(createBody)
    }, env);
    expect(await again.json()).toMatchObject({ existing: true, registered: true });
    expect(await findFilesByObjectKey(env.DB, created.assetKey)).toHaveLength(1);
  });

  it('gates private objects while unlisted, public, system and legacy keys stay open', async () => {
    const keys = {
      legacy: 'assets/uploads/legacy/old.png',
      priv: `assets/sha256/${'1'.repeat(64)}`,
      unl: `assets/sha256/${'2'.repeat(64)}`,
      pub: `assets/sha256/${'3'.repeat(64)}`,
      sys: `assets/sha256/${'4'.repeat(64)}`
    };
    for (const key of Object.values(keys)) {
      await bucket.put(key, CONTENT, { httpMetadata: { contentType: 'image/png' } });
    }
    const seed = (id: string, ownerId: string, objectKey: string, visibility: 'private' | 'unlisted' | 'public') =>
      registerFile(env.DB, {
        id, ownerId, folderId: null, name: id, kind: 'image', objectKey, hash: '',
        sizeBytes: CONTENT.length, contentType: 'image/png', visibility,
        createdAt: '2026-01-01', updatedAt: '2026-01-01'
      });
    await seed('r-priv', id1, keys.priv, 'private');
    await seed('r-unl', id1, keys.unl, 'unlisted');
    await seed('r-pub', id1, keys.pub, 'public');
    await seed('r-sys', 'system', keys.sys, 'public');

    expect((await serve(keys.legacy)).status).toBe(200);
    expect((await serve(keys.priv)).status).toBe(401);
    expect((await serve(keys.priv, { Authorization: `Bearer ${token2}` })).status).toBe(403);
    expect((await serve(keys.priv, { Authorization: `Bearer ${token1}` })).status).toBe(200);
    expect((await serve(keys.unl)).status).toBe(200);
    expect((await serve(keys.pub)).status).toBe(200);
    expect((await serve(keys.sys)).status).toBe(200);

    const ranged = await serve(keys.pub, { Range: 'bytes=0-3' });
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe(CONTENT.slice(0, 4));
    const ownerRange = await serve(keys.priv, { Range: 'bytes=0-3', Authorization: `Bearer ${token1}` });
    expect(ownerRange.status).toBe(206);
  });

  it('registers authenticated single-shot uploads only', async () => {
    const key = 'assets/uploads/owner_one/direct.png';
    const authed = await app.request(`/api/v1/assets/upload?key=${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token1}` },
      body: CONTENT
    }, env);
    expect(await authed.json()).toMatchObject({ status: 'uploaded', registered: true });
    expect(await findFilesByObjectKey(env.DB, key)).toHaveLength(1);

    const anonKey = 'assets/uploads/anon/direct.png';
    const anon = await app.request(`/api/v1/assets/upload?key=${anonKey}`, {
      method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: CONTENT
    }, env);
    expect(await anon.json()).toMatchObject({ status: 'uploaded', registered: false });
    expect(await findFilesByObjectKey(env.DB, anonKey)).toHaveLength(0);
    expect((await serve(anonKey)).status).toBe(200);
  });
});