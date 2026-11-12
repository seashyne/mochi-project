import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateManifestAssets } from '../src/services/manifestAssets';
import { MAX_WHOLE_HASH_BYTES } from '../src/services/assetIntegrity';
import { assetRef, bytesOf, chunkRef, manifest, ManifestBucket } from './manifestAssetFixtures';

describe('v2 publication asset verification', () => {
  let bucket: ManifestBucket;
  beforeEach(() => { bucket = new ManifestBucket(); bucket.storeChunk(); });
  const validate = (bucket: ManifestBucket, overrides: Record<string, unknown> = {}) =>
    validateManifestAssets(bucket.env, manifest(overrides));

  it('verifies actual streamed bytes against independent SHA-256 fixtures', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hello'));
    expect(await validate(bucket, { assets: [ref] })).toEqual([]);
    expect(bucket.get).toHaveBeenCalledTimes(2);
    expect(bucket.get).toHaveBeenCalledWith(ref.key, { onlyIf: { etagMatches: 'etag-1' } });
  });

  it('ignores forged customMetadata.sha256 and rejects wrong content', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('wrong'));
    expect(await validate(bucket, { assets: [ref] })).toEqual([expect.stringContaining('content SHA-256 mismatch')]);
  });

  it('accepts valid bytes even when client metadata contains a false digest', async () => {
    const ref = assetRef();
    const stored = bucket.store(ref, bytesOf('hello'));
    stored.metadata = { ...stored.metadata, customMetadata: { sha256: 'f'.repeat(64) } };
    expect(await validate(bucket, { assets: [ref] })).toEqual([]);
  });

  it.each(['asset', 'chunk'])('rejects a missing %s', async (kind) => {
    const overrides = kind === 'asset' ? { assets: [assetRef()] } : {};
    if (kind === 'chunk') bucket.objects.clear();
    expect(await validate(bucket, overrides)).toEqual([expect.stringContaining('R2 object is missing')]);
  });

  it.each([
    [{ size: 6 }, 'R2 size mismatch'],
    [{ httpMetadata: { contentType: 'image/png' } }, 'R2 content type mismatch'],
    [{ httpMetadata: {} }, 'R2 content type mismatch']
  ])('rejects incorrect stored metadata %j', async (metadata, message) => {
    const ref = assetRef();
    const stored = bucket.store(ref, bytesOf('hello'));
    stored.metadata = { ...stored.metadata, ...metadata };
    expect(await validate(bucket, { assets: [ref] })).toEqual([expect.stringContaining(message)]);
    expect(bucket.get.mock.calls.some(([key]) => key === ref.key)).toBe(false);
  });

  it.each([
    ['https://evil.example/asset', 'canonical public asset URL'],
    [assetRef().url + '?different=1', 'canonical public asset URL'],
    [assetRef().url + '#different', 'canonical public asset URL']
  ])('rejects noncanonical serving URL %s before R2 access', async (url, message) => {
    expect(await validate(bucket, { assets: [{ ...assetRef(), url }] })).toEqual([expect.stringContaining(message)]);
    expect(bucket.head).not.toHaveBeenCalled();
  });

  it('uses the configured canonical origin, including base paths', async () => {
    const chunk = chunkRef();
    const env = { ...bucket.env, PUBLIC_ASSETS_URL: 'https://cdn.example/game///' };
    expect(await validateManifestAssets(env, manifest({ chunks: [{ ...chunk, url: `https://cdn.example/game/${chunk.key}` }] }))).toEqual([]);
  });

  it('rejects keys that do not match the claimed hash', async () => {
    expect(await validate(bucket, { assets: [{ ...assetRef(), key: 'assets/uploads/not-content-addressed' }] }))
      .toEqual([expect.stringContaining('key must match')]);
    expect(bucket.head).not.toHaveBeenCalled();
  });

  it('rejects disallowed MIME types and noninteger byte sizes structurally', async () => {
    expect(await validate(bucket, { assets: [{ ...assetRef(), contentType: 'image/svg+xml' }] }))
      .toEqual([expect.stringContaining('content type is not allowed')]);
    expect(await validate(bucket, { assets: [{ ...assetRef(), sizeBytes: 1.5 }] }))
      .toEqual([expect.stringContaining('sizeBytes is out of range')]);
    expect(bucket.head).not.toHaveBeenCalled();
  });

  it('deduplicates equivalent refs across assets and chunks without repeated reads', async () => {
    const chunk = chunkRef();
    expect(await validate(bucket, { chunks: [chunk, { ...chunk, id: 'other' }], assets: [chunk, chunk] })).toEqual([]);
    expect(bucket.head).toHaveBeenCalledTimes(1);
    expect(bucket.get).toHaveBeenCalledTimes(1);
  });

  it.each([{ sizeBytes: 6 }, { contentType: 'text/plain' }])('rejects conflicting definitions %j', async (change) => {
    const ref = assetRef();
    expect(await validate(bucket, { assets: [ref, { ...ref, ...change }] }))
      .toEqual([expect.stringContaining('conflicting reference definitions')]);
    expect(bucket.head).not.toHaveBeenCalled();
  });

  it('rejects oversized unverified multipart content without reading its body', async () => {
    const ref = { ...assetRef(), sizeBytes: MAX_WHOLE_HASH_BYTES + 1 };
    const stored = bucket.store(ref, bytesOf('hello'));
    stored.stream = vi.fn(() => { throw new Error('Must not read oversized body'); });
    expect(await validate(bucket, { assets: [ref] })).toEqual([expect.stringContaining('no storage-validated SHA-256')]);
    expect(bucket.get.mock.calls.some(([key]) => key === ref.key)).toBe(false);
    expect(stored.stream).not.toHaveBeenCalled();
  });

  it('accepts large references with native storage-validated SHA-256 without body reads', async () => {
    const ref = { ...assetRef(), sizeBytes: 10 * 1024 * 1024 * 1024 };
    const stored = bucket.store(ref, bytesOf('hello'), true);
    stored.stream = vi.fn(() => { throw new Error('Native checksum must avoid body read'); });
    expect(await validate(bucket, { assets: [ref] })).toEqual([]);
    expect(stored.stream).not.toHaveBeenCalled();
    expect(bucket.get.mock.calls.some(([key]) => key === ref.key)).toBe(false);
  });

  it('rejects native checksum mismatches instead of trusting metadata or falling back', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('wrong'), true);
    expect(await validate(bucket, { assets: [ref] })).toEqual([expect.stringContaining('R2 SHA-256 checksum mismatch')]);
    expect(bucket.get.mock.calls.some(([key]) => key === ref.key)).toBe(false);
  });

  it('does not access storage or impose v2 constraints on legacy manifests', async () => {
    expect(await validateManifestAssets(bucket.env, JSON.stringify({ assets: ['legacy'], chunks: null }))).toEqual([]);
    expect(bucket.head).not.toHaveBeenCalled();
  });

  it('propagates storage failures rather than accepting unverified data', async () => {
    bucket.head.mockRejectedValueOnce(new Error('R2 unavailable'));
    await expect(validate(bucket)).rejects.toThrow('R2 unavailable');
  });
});
