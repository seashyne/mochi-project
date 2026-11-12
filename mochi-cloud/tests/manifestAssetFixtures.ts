import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { ManifestAssetRef } from '../src/services/manifestValidation';

export const PUBLIC_URL = 'https://assets-game.lenout.com';
export const bytesOf = (value: string) => new TextEncoder().encode(value);
export const digestOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function assetRef(bytes = bytesOf('hello'), contentType = 'application/octet-stream'): ManifestAssetRef {
  const hash = digestOf(bytes);
  const key = `assets/sha256/${hash}`;
  return { hash, key, url: `${PUBLIC_URL}/${key}`, sizeBytes: bytes.length, contentType };
}

export function chunkRef(id = '0,0,0') {
  return {
    ...assetRef(bytesOf('{"objects":[{}]}'), 'application/json'), id, objectCount: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }
  };
}

export function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    manifestVersion: '2.0', title: 'Verified world', version: '1.0.0',
    chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 100 },
    chunks: [chunkRef()], assets: [], ...overrides
  });
}

type FixtureMetadata = { [K in keyof R2Object]: R2Object[K] };
interface StoredFixture {
  metadata: FixtureMetadata;
  stream: () => ReadableStream<Uint8Array>;
}

export class ManifestBucket {
  readonly objects = new Map<string, StoredFixture>();
  readonly head = vi.fn(async (key: string): Promise<R2Object | null> => this.objects.get(key)?.metadata ?? null);
  readonly get = vi.fn(async (key: string, options?: R2GetOptions): Promise<R2Object | R2ObjectBody | null> => {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const condition = options?.onlyIf as R2Conditional | undefined;
    if (condition?.etagMatches && condition.etagMatches !== stored.metadata.etag) return stored.metadata;
    const response = new Response(stored.stream());
    return {
      ...stored.metadata, body: response.body!, bodyUsed: false,
      arrayBuffer: () => response.arrayBuffer(), bytes: async () => new Uint8Array(await response.arrayBuffer()),
      text: () => response.text(), json: <T>() => response.json<T>(), blob: () => response.blob()
    };
  });
  private r2Get(key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2Object | R2ObjectBody | null>;
  private r2Get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  private r2Get(key: string, options?: R2GetOptions): Promise<R2Object | R2ObjectBody | null> {
    return this.get(key, options);
  }
  readonly binding: R2Bucket = {
    head: this.head, get: this.r2Get.bind(this),
    put: async () => { throw new Error('Unexpected R2 write'); },
    delete: async () => { throw new Error('Unexpected R2 delete'); },
    list: async () => { throw new Error('Unexpected R2 list'); },
    createMultipartUpload: async () => { throw new Error('Unexpected multipart upload'); },
    resumeMultipartUpload: () => { throw new Error('Unexpected multipart upload'); }
  };
  readonly env = { ASSETS: this.binding, PUBLIC_ASSETS_URL: PUBLIC_URL };

  store(ref: ManifestAssetRef, bytes: Uint8Array, nativeChecksum = false): StoredFixture {
    const checksum = Uint8Array.from(Buffer.from(digestOf(bytes), 'hex')).buffer;
    const stored: StoredFixture = {
      metadata: {
        key: ref.key, version: 'version-1', etag: 'etag-1', httpEtag: '"etag-1"', size: ref.sizeBytes,
        uploaded: new Date(), storageClass: 'Standard',
        httpMetadata: { contentType: ref.contentType },
        // Deliberately mirrors the untrusted upload metadata, even for wrong bytes.
        customMetadata: { sha256: ref.hash },
        checksums: { ...(nativeChecksum ? { sha256: checksum } : {}), toJSON: () => ({}) },
        writeHttpMetadata: () => undefined
      },
      stream: () => new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(bytes); controller.close(); }
      })
    };
    this.objects.set(ref.key, stored);
    return stored;
  }

  storeChunk() { return this.store(chunkRef(), bytesOf('{"objects":[{}]}')); }

  index(value: unknown) {
    const bytes = bytesOf(JSON.stringify(value));
    const ref = assetRef(bytes, 'application/json');
    this.store(ref, bytes);
    return ref;
  }
}
