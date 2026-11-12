// Resumable multipart asset upload pipeline tests.

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

interface StoredObject {
  data: Uint8Array;
  contentType: string;
}

class MockMultipartBucket {
  public objects = new Map<string, StoredObject>();
  private uploads = new Map<
    string,
    { key: string; contentType: string; parts: Map<number, Uint8Array> }
  >();

  async head(key: string): Promise<R2Object | null> {
    const object = this.objects.get(key);
    return object
      ? ({ key, size: object.data.length, etag: 'head-etag' } as unknown as R2Object)
      : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async createMultipartUpload(
    key: string,
    options?: R2MultipartOptions
  ): Promise<R2MultipartUpload> {
    const uploadId = crypto.randomUUID();
    const contentType =
      (options?.httpMetadata as { contentType?: string } | undefined)
        ?.contentType || 'application/octet-stream';
    this.uploads.set(uploadId, { key, contentType, parts: new Map() });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const record = this.uploads.get(uploadId);
    if (!record || record.key !== key) throw new Error('Upload not found');

    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: unknown) => {
        const data = await toBytes(value);
        record.parts.set(partNumber, data);
        return { partNumber, etag: `etag-${partNumber}` };
      },
      complete: async (uploadedParts: R2UploadedPart[]) => {
        const chunks: Uint8Array[] = [];
        for (const part of uploadedParts) {
          const data = record.parts.get(part.partNumber);
          if (!data) throw new Error(`Missing part ${part.partNumber}`);
          chunks.push(data);
        }
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.objects.set(key, { data: merged, contentType: record.contentType });
        this.uploads.delete(uploadId);
        return {
          key,
          size: merged.length,
          etag: 'complete-etag'
        } as unknown as R2Object;
      },
      abort: async () => {
        this.uploads.delete(uploadId);
      }
    } as R2MultipartUpload;
  }
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  if (value instanceof ReadableStream) {
    return new Uint8Array(await new Response(value).arrayBuffer());
  }
  throw new Error('Unsupported part value');
}

const SHA = 'a'.repeat(64);

describe('Multipart Asset Upload Pipeline', () => {
  let env: MochiEnv;
  let bucket: MockMultipartBucket;
  let token: string;

  async function registerUser() {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'asset_creator',
        email: 'assets@mochi.dev',
        password: 'password123'
      })
    }, env);

    const otp = await env.DB.prepare(
      'SELECT code FROM email_verification_otps WHERE email = ?'
    ).bind('assets@mochi.dev').first<{ code: string }>();

    const verify = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'assets@mochi.dev', code: otp!.code })
    }, env);

    return ((await verify.json()) as { token: string }).token;
  }

  async function createUpload(sizeBytes = 5, sha256 = SHA) {
    return app.request('/api/v1/assets/multipart/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        filename: 'world-chunk.json',
        contentType: 'application/json',
        sizeBytes,
        sha256
      })
    }, env);
  }

  beforeEach(async () => {
    bucket = new MockMultipartBucket();
    env = {
      DB: createMockDb(),
      ASSETS: bucket as unknown as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
    token = await registerUser();
  });

  it('creates, uploads, completes, and deduplicates a content-addressed asset', async () => {
    const createRes = await createUpload(5);
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      existing: boolean;
      assetKey: string;
      uploadId: string;
      uploadToken: string;
      partSize: number;
      totalParts: number;
    };
    expect(created.existing).toBe(false);
    expect(created.assetKey).toBe(`assets/sha256/${SHA}`);
    expect(created.totalParts).toBe(1);
    expect(created.partSize).toBeGreaterThanOrEqual(64 * 1024 * 1024);

    const partRes = await app.request(
      `/api/v1/assets/multipart/part?key=${encodeURIComponent(created.assetKey)}&uploadId=${created.uploadId}&partNumber=1`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Token': created.uploadToken
        },
        body: 'hello'
      },
      env
    );
    expect(partRes.status).toBe(200);
    const part = (await partRes.json()) as { partNumber: number; etag: string };
    expect(part.partNumber).toBe(1);

    const completeRes = await app.request(
      `/api/v1/assets/multipart/complete?key=${encodeURIComponent(created.assetKey)}&uploadId=${created.uploadId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Token': created.uploadToken
        },
        body: JSON.stringify({ parts: [part] })
      },
      env
    );
    expect(completeRes.status).toBe(200);
    const completed = (await completeRes.json()) as {
      assetKey: string;
      publicUrl: string;
      sizeBytes: number;
    };
    expect(completed.sizeBytes).toBe(5);
    expect(completed.publicUrl).toBe(
      `https://assets-game.lenout.com/assets/sha256/${SHA}`
    );

    const dedupRes = await createUpload(5);
    const dedup = (await dedupRes.json()) as {
      existing: boolean;
      assetKey: string;
    };
    expect(dedup.existing).toBe(true);
    expect(dedup.assetKey).toBe(`assets/sha256/${SHA}`);
  });

  it('rejects invalid digests, oversized assets, and mismatched upload tokens', async () => {
    const badHash = await createUpload(5, 'not-a-hash');
    expect(badHash.status).toBe(400);

    const tooLarge = await createUpload(901 * 1024 * 1024 * 1024);
    expect(tooLarge.status).toBe(400);

    const created = (await (await createUpload(5)).json()) as {
      assetKey: string;
      uploadId: string;
      uploadToken: string;
    };

    const wrongKey = await app.request(
      `/api/v1/assets/multipart/part?key=assets/sha256/${'b'.repeat(64)}&uploadId=${created.uploadId}&partNumber=1`,
      {
        method: 'PUT',
        headers: { 'X-Upload-Token': created.uploadToken },
        body: 'hello'
      },
      env
    );
    expect(wrongKey.status).toBe(401);

    const outOfRange = await app.request(
      `/api/v1/assets/multipart/part?key=${encodeURIComponent(created.assetKey)}&uploadId=${created.uploadId}&partNumber=9`,
      {
        method: 'PUT',
        headers: { 'X-Upload-Token': created.uploadToken },
        body: 'hello'
      },
      env
    );
    expect(outOfRange.status).toBe(400);
  });

  it('aborts incomplete uploads without creating an object', async () => {
    const created = (await (await createUpload(5)).json()) as {
      assetKey: string;
      uploadId: string;
      uploadToken: string;
    };

    const abortRes = await app.request(
      `/api/v1/assets/multipart/abort?key=${encodeURIComponent(created.assetKey)}&uploadId=${created.uploadId}`,
      {
        method: 'DELETE',
        headers: { 'X-Upload-Token': created.uploadToken }
      },
      env
    );
    expect(abortRes.status).toBe(200);
    expect(bucket.objects.size).toBe(0);
  });

  it('splits large assets into multiple parts', async () => {
    const size = 64 * 1024 * 1024 + 1;
    const created = (await (await createUpload(size)).json()) as {
      totalParts: number;
      partSize: number;
    };
    expect(created.totalParts).toBe(2);
    expect(created.partSize).toBeGreaterThanOrEqual(64 * 1024 * 1024);
  });
});
