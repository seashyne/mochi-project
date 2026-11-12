// SHA-256 vectors, multipart uploader, and chunked publish manifest tests

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient } from '../src/api/client';
import { Sha256Hasher, hashBlob, hashBytes } from '../src/api/sha256';
import { MultipartUploader } from '../src/api/multipartUpload';
import { StudioObject } from '../src/engine/studio/types';
import { validateManifestV2 } from '../src/engine/package/manifestV2';
import { buildPublishManifest } from '../src/engine/package/publishWorld';

const { uploadBlobMock } = vi.hoisted(() => ({ uploadBlobMock: vi.fn() }));
vi.mock('../src/api/assets', () => ({
  assetsApi: { uploadBlob: uploadBlobMock }
}));

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const FOX_SHA = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592';
const encoder = new TextEncoder();

function makeObject(id: string, x: number): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    color: '#6366f1'
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  uploadBlobMock.mockReset();
});

describe('SHA-256 implementation', () => {
  it('matches the empty, "abc", and quick brown fox vectors', async () => {
    expect(await hashBytes(new Uint8Array())).toBe(EMPTY_SHA);
    expect(await hashBytes(encoder.encode('abc'))).toBe(ABC_SHA);
    expect(await hashBytes(encoder.encode('The quick brown fox jumps over the lazy dog'))).toBe(FOX_SHA);
    expect(await hashBlob(new Blob(['']))).toBe(EMPTY_SHA);
  });

  it('matches vectors through the incremental streaming hasher', () => {
    const hasher = new Sha256Hasher();
    expect(hasher.update(encoder.encode('')).digestHex()).toBe(EMPTY_SHA);

    const abc = new Sha256Hasher();
    abc.update(encoder.encode('a')).update(encoder.encode('bc'));
    expect(abc.digestHex()).toBe(ABC_SHA);
  });
});

describe('MultipartUploader', () => {
  function makeClient(create: unknown) {
    return {
      post: vi.fn(async () => create),
      request: vi.fn(async () => ({
        assetKey: 'assets/sha256/' + 'b'.repeat(64),
        publicUrl: 'https://cdn.test/final',
        sizeBytes: 2048,
        contentType: 'application/json',
        etag: 'complete-etag'
      })),
      getBaseUrl: () => 'https://api.test'
    } as unknown as ApiClient;
  }

  it('uploads all parts and completes with sorted part etags', async () => {
    const client = makeClient({
      existing: false,
      assetKey: 'assets/sha256/' + 'a'.repeat(64),
      publicUrl: 'https://cdn.test/pending',
      uploadId: 'upload-1',
      uploadToken: 'token-1',
      partSize: 1024,
      totalParts: 2,
      sizeBytes: 2048
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const url = String(_url);
      const partNumber = Number(new URL(url).searchParams.get('partNumber'));
      expect((init.headers as Record<string, string>)['X-Upload-Token']).toBe('token-1');
      return new Response(JSON.stringify({ partNumber, etag: `etag-${partNumber}` }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const uploader = new MultipartUploader(client);
    const data = new Blob([new Uint8Array(2048)], { type: 'application/json' });
    const phases: string[] = [];
    const result = await uploader.upload(data, {
      filename: 'world.json',
      token: 'user-token',
      onProgress: (p) => phases.push(p.phase)
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(phases).toContain('hashing');
    expect(phases).toContain('uploading');
    expect(phases.at(-1)).toBe('completing');
    expect(result.assetKey).toBe('assets/sha256/' + 'b'.repeat(64));
    expect(result.sha256).toHaveLength(64);

    const [, completeInit] = (client.request as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const parts = JSON.parse(String((completeInit as RequestInit).body)).parts;
    expect(parts).toEqual([
      { partNumber: 1, etag: 'etag-1' },
      { partNumber: 2, etag: 'etag-2' }
    ]);
  });

  it('skips network upload when the content already exists', async () => {
    const client = makeClient({
      existing: true,
      assetKey: 'assets/sha256/' + 'c'.repeat(64),
      publicUrl: 'https://cdn.test/existing'
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MultipartUploader(client).upload(
      new Blob([encoder.encode('{}')], { type: 'application/json' })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
    expect(result.publicUrl).toBe('https://cdn.test/existing');
    expect(result.etag).toBe('existing');
  });
});

describe('chunked publish manifest', () => {
  function stubAssetUploads() {
    let calls = 0;
    uploadBlobMock.mockImplementation(async (blob: Blob) => {
      calls++;
      return {
        assetKey: `assets/sha256/${String(calls).padStart(64, '0')}`,
        publicUrl: `https://cdn.test/asset-${calls}`,
        sizeBytes: blob.size,
        contentType: blob.type || 'application/json',
        etag: `etag-${calls}`,
        sha256: String(calls).padStart(64, '0')
      };
    });
  }

  it('keeps small worlds inline without uploading chunks', async () => {
    const json = await buildPublishManifest({
      title: 'Small World',
      version: '1.0.0',
      objects: [makeObject('a', 0), makeObject('b', 4)],
      scriptCode: 'print("hi")'
    });

    expect(uploadBlobMock).not.toHaveBeenCalled();
    expect(JSON.parse(json)).toEqual({
      objects: [makeObject('a', 0), makeObject('b', 4)],
      scriptCode: 'print("hi")',
      version: '1.0.0'
    });
  });

  it('uploads chunks and produces a valid inline manifest v2', async () => {
    stubAssetUploads();
    const objects = Array.from({ length: 401 }, (_, i) => makeObject(`o${i}`, i % 10));
    const json = await buildPublishManifest({ title: 'Big World', version: '2.0.0', objects });
    const manifest = JSON.parse(json);

    expect(manifest.manifestVersion).toBe('2.0');
    expect(manifest.chunkIndex).toBeUndefined();
    expect(manifest.chunks).toHaveLength(3);
    expect(validateManifestV2(manifest)).toEqual([]);
    expect(uploadBlobMock).toHaveBeenCalledTimes(3);
  });

  it('moves oversized chunk lists into an uploaded chunk index', async () => {
    stubAssetUploads();
    const objects = Array.from({ length: 420 }, (_, i) => makeObject(`o${i}`, i * 64));
    const progress: string[] = [];
    const json = await buildPublishManifest({
      title: 'Huge World',
      version: '3.0.0',
      objects,
      onProgress: (stage) => progress.push(stage)
    });
    const manifest = JSON.parse(json);

    expect(manifest.chunks).toBeUndefined();
    expect(manifest.chunkIndex).toBeDefined();
    expect(manifest.chunkIndex.url).toBeTruthy();
    expect(validateManifestV2(manifest)).toEqual([]);
    expect(uploadBlobMock).toHaveBeenCalledTimes(421);
    expect(progress).toContain('uploading-index');
  });
});
