import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_WHOLE_HASH_BYTES } from '../src/services/assetIntegrity';
import { verifyManifestAsset } from '../src/services/manifestAssetStorage';
import { assetRef, bytesOf, ManifestBucket } from './manifestAssetFixtures';

describe('R2 publication verification read bounds and object identity', () => {
  let bucket: ManifestBucket;
  beforeEach(() => { bucket = new ManifestBucket(); });
  const budget = () => ({ remainingBytes: MAX_WHOLE_HASH_BYTES });

  it('shares the fallback budget across objects and refuses the next read at the boundary', async () => {
    const first = assetRef();
    const second = assetRef(bytesOf('other'));
    bucket.store(first, bytesOf('hello'));
    bucket.store(second, bytesOf('other'));
    const shared = { remainingBytes: 9 };
    await verifyManifestAsset(bucket.binding, first, shared);
    expect(shared.remainingBytes).toBe(4);
    await expect(verifyManifestAsset(bucket.binding, second, shared)).rejects.toThrow('remaining fallback hash budget');
    expect(bucket.get).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly the remaining hash read budget', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hello'));
    const shared = { remainingBytes: 5 };
    await verifyManifestAsset(bucket.binding, ref, shared);
    expect(shared.remainingBytes).toBe(0);
  });

  it('charges fallback index reads to the same hash budget', async () => {
    const ref = assetRef(bytesOf('[]'), 'application/json');
    bucket.store(ref, bytesOf('[]'));
    const shared = { remainingBytes: 2 };
    expect(await verifyManifestAsset(bucket.binding, ref, shared, true)).toEqual(bytesOf('[]'));
    expect(shared.remainingBytes).toBe(0);
  });

  it('reads bounded native-checksum indexes without charging fallback hashing', async () => {
    const ref = assetRef(bytesOf('[]'), 'application/json');
    bucket.store(ref, bytesOf('[]'), true);
    const shared = { remainingBytes: 0 };
    expect(await verifyManifestAsset(bucket.binding, ref, shared, true)).toEqual(bytesOf('[]'));
    expect(shared.remainingBytes).toBe(0);
  });

  it.each([false, true])('cancels a body exceeding its declared byte limit (index: %s)', async (index) => {
    const ref = assetRef(bytesOf('[]'), 'application/json');
    const stored = bucket.store(ref, bytesOf('[]'));
    const cancel = vi.fn();
    stored.stream = () => new ReadableStream({
      start(controller) { controller.enqueue(bytesOf('[123]')); }, cancel
    });
    const shared = budget();
    await expect(verifyManifestAsset(bucket.binding, ref, shared, index)).rejects.toThrow('body exceeds declared byte size');
    expect(cancel).toHaveBeenCalledOnce();
    expect(shared.remainingBytes).toBe(MAX_WHOLE_HASH_BYTES); // Overshoot bytes are not hashed.
  });

  it('rejects truncated bodies rather than trusting their head size', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hi'));
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow('body size mismatch');
  });

  it('hashes across arbitrary streamed boundaries', async () => {
    const bytes = bytesOf('a'.repeat(153));
    const ref = assetRef(bytes);
    const stored = bucket.store(ref, bytes);
    stored.stream = () => new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1)); controller.enqueue(bytes.slice(1, 66));
        controller.enqueue(bytes.slice(66)); controller.close();
      }
    });
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).resolves.toBeUndefined();
  });

  it.each(['condition', 'version', 'etag', 'size', 'mime'])('rejects head/get replacement mismatch: %s', async (kind) => {
    const ref = assetRef();
    const stored = bucket.store(ref, bytesOf('hello'));
    const head = stored.metadata;
    const cancel = vi.fn();
    stored.stream = () => new ReadableStream({ cancel });
    bucket.head.mockImplementationOnce(async () => {
      stored.metadata = {
        ...head,
        ...(kind === 'version' ? { version: 'replacement-version' } : {}),
        ...(kind === 'condition' || kind === 'etag' ? { etag: 'replacement-etag' } : {}),
        ...(kind === 'size' ? { size: 20 } : {}),
        ...(kind === 'mime' ? { httpMetadata: { contentType: 'text/plain' } } : {})
      };
      return head;
    });
    if (kind === 'etag') {
      const normalGet = bucket.get.getMockImplementation()!;
      // A faulty/unconditional mock must not bypass the explicit identity check.
      bucket.get.mockImplementationOnce((key) => normalGet(key));
    }
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow(/changed during verification|mismatch/);
    expect(bucket.get).toHaveBeenCalledWith(ref.key, { onlyIf: { etagMatches: head.etag } });
    if (kind !== 'condition') expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects disappearance between head and conditional get', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hello'));
    bucket.get.mockResolvedValueOnce(null);
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow('disappeared');
  });

  it('rejects missing versions, partial metadata and malformed native checksums', async () => {
    const ref = assetRef();
    const stored = bucket.store(ref, bytesOf('hello'));
    stored.metadata = { ...stored.metadata, version: '' };
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow('version is unavailable');
    stored.metadata = { ...stored.metadata, version: 'v1', range: { offset: 0, length: 1 } };
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow('partial R2 objects');
    stored.metadata = { ...stored.metadata, range: undefined, checksums: { sha256: new ArrayBuffer(1), toJSON: () => ({}) } };
    await expect(verifyManifestAsset(bucket.binding, ref, budget())).rejects.toThrow('invalid R2 SHA-256 checksum');
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('rejects encoded external indexes before reading and cancels the body', async () => {
    const ref = assetRef(bytesOf('[]'), 'application/json');
    const stored = bucket.store(ref, bytesOf('[]'));
    stored.metadata = { ...stored.metadata, httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } };
    const cancel = vi.fn();
    stored.stream = () => new ReadableStream({ cancel });
    await expect(verifyManifestAsset(bucket.binding, ref, budget(), true)).rejects.toThrow('encoded indexes are not supported');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
