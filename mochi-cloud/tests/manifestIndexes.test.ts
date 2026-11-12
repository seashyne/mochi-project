import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateManifestAssets } from '../src/services/manifestAssets';
import { MAX_INDEX_BYTES } from '../src/services/manifestAssetStorage';
import { MAX_V2_ASSETS, MAX_V2_CHUNKS } from '../src/services/manifestValidation';
import { assetRef, bytesOf, chunkRef, manifest, ManifestBucket } from './manifestAssetFixtures';

describe('bounded external publication indexes', () => {
  let bucket: ManifestBucket;
  beforeEach(() => { bucket = new ManifestBucket(); bucket.storeChunk(); });
  const validate = (overrides: Record<string, unknown>) => validateManifestAssets(bucket.env, manifest(overrides));

  it.each([false, true])('expands and verifies both index types (envelopes: %s) using only R2 keys', async (envelope) => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hello'));
    const chunkIndex = bucket.index(envelope ? { chunks: [chunkRef()] } : [chunkRef()]);
    const assetIndex = bucket.index(envelope ? { assets: [ref] } : [ref]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await validate({ chunks: [], chunkIndex, assetIndex })).toEqual([]);
      expect(bucket.get).toHaveBeenCalledTimes(4);
      expect(bucket.get).toHaveBeenCalledWith(chunkIndex.key, { onlyIf: { etagMatches: 'etag-1' } });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it('deduplicates references across inline and indexed assets', async () => {
    const ref = assetRef();
    bucket.store(ref, bytesOf('hello'));
    const assetIndex = bucket.index([ref, ref]);
    expect(await validate({ assets: [ref, assetIndex], assetIndex })).toEqual([]);
    expect(bucket.head).toHaveBeenCalledTimes(3);
    expect(bucket.get).toHaveBeenCalledTimes(3);
  });

  it('rejects conflicting definitions between indexes and inline refs', async () => {
    const ref = assetRef();
    const assetIndex = bucket.index([{ ...ref, sizeBytes: ref.sizeBytes + 1 }]);
    expect(await validate({ assets: [ref], assetIndex })).toEqual([expect.stringContaining('conflicting reference definitions')]);
    expect(bucket.head).toHaveBeenCalledTimes(1); // Only the index, no referenced asset reads.
  });

  it.each(['assetIndex', 'chunkIndex'])('rejects a missing or cross-origin %s', async (name) => {
    const index = assetRef(bytesOf('[]'), 'application/json');
    expect(await validate({ [name]: index })).toEqual([expect.stringContaining('R2 object is missing')]);
    expect(await validate({ [name]: { ...index, url: 'https://elsewhere.example/index.json' } }))
      .toEqual([expect.stringContaining('canonical public asset URL')]);
  });

  it('rejects an incorrect index SHA even with forged matching custom metadata', async () => {
    const ref = assetRef(bytesOf('[]'), 'application/json');
    bucket.store(ref, bytesOf('{}'));
    expect(await validate({ assetIndex: ref })).toEqual([expect.stringContaining('content SHA-256 mismatch')]);
  });

  it.each([null, 12, {}, { assets: {} }, { chunks: [] }, { assets: [], assetIndex: {} }])(
    'rejects malformed or nested index envelopes %j', async (value) => {
      expect((await validate({ assetIndex: bucket.index(value) })).join(' ')).toMatch(/index must/);
    }
  );

  it.each(['not JSON', '[', '{"assets":'])('rejects malformed JSON %s', async (text) => {
    const bytes = bytesOf(text);
    const ref = assetRef(bytes, 'application/json');
    bucket.store(ref, bytes);
    expect(await validate({ assetIndex: ref })).toEqual([expect.stringContaining('not valid UTF-8 JSON')]);
  });

  it('rejects invalid UTF-8 even if replacement decoding would produce valid JSON', async () => {
    const bytes = new Uint8Array([91, 34, 255, 34, 93]);
    const ref = assetRef(bytes, 'application/json');
    bucket.store(ref, bytes);
    expect(await validate({ assetIndex: ref })).toEqual([expect.stringContaining('not valid UTF-8 JSON')]);
  });

  it.each([false, true])('rejects oversized indexes before get, even with native checksum: %s', async (native) => {
    const ref = { ...assetRef(bytesOf('[]'), 'application/json'), sizeBytes: MAX_INDEX_BYTES + 1 };
    bucket.store(ref, bytesOf('[]'), native);
    expect(await validate({ assetIndex: ref })).toEqual([expect.stringContaining('index exceeds')]);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it.each([
    [{ contentType: 'text/plain' }, 'content type must be application/json'],
    [{ sizeBytes: 0 }, 'sizeBytes is out of range']
  ])('validates index references themselves %j', async (changes, error) => {
    expect((await validate({ assetIndex: { ...assetRef(), ...changes } })).join(' ')).toContain(error);
  });

  it.each(['chunkIndex', 'assetIndex'])('rejects malformed optional %s', async (name) => {
    expect((await validate({ [name]: null })).join(' ')).toContain(`${name} must be an object`);
  });

  it('rejects duplicate chunk IDs across inline and indexed chunks', async () => {
    expect((await validate({ chunkIndex: bucket.index([chunkRef()]) })).join(' ')).toContain('id is duplicated');
  });

  it.each([
    [{ bounds: null }, '.bounds is required'],
    [{ id: '' }, '.id is required'],
    [{ objectCount: 1.5 }, '.objectCount is out of range'],
    [{ sizeBytes: 64 * 1024 * 1024 + 1 }, '64MB chunk ceiling']
  ])('validates expanded chunk shape %j', async (changes, message) => {
    const chunkIndex = bucket.index([{ ...chunkRef(), ...changes }]);
    expect((await validate({ chunks: [], chunkIndex })).join(' ')).toContain(message);
    expect(bucket.head).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty chunk index when there are no inline chunks', async () => {
    expect((await validate({ chunks: [], chunkIndex: bucket.index([]) })).join(' ')).toContain('must include chunks');
  });

  it('validates expanded asset shape and canonical URLs', async () => {
    expect((await validate({ assetIndex: bucket.index([{ hash: 'invalid' }]) })).join(' ')).toContain('hash must be a sha256');
    expect((await validate({ assetIndex: bucket.index([{ ...assetRef(), url: 'https://evil.example/object' }]) })).join(' '))
      .toContain('canonical public asset URL');
  });

  it('applies the combined inline-plus-indexed asset count limit before asset reads', async () => {
    const assetIndex = bucket.index(Array.from({ length: MAX_V2_ASSETS }, () => assetRef()));
    expect(await validate({ assets: [assetRef()], assetIndex })).toEqual([`assets exceeds ${MAX_V2_ASSETS} entries`]);
    expect(bucket.head).toHaveBeenCalledTimes(1);
  });

  it('applies the combined chunk count limit to external indexes', async () => {
    const chunkIndex = bucket.index(Array.from({ length: MAX_V2_CHUNKS }, (_, i) => chunkRef(`indexed-${i}`)));
    expect(await validate({ chunkIndex })).toEqual([`chunks exceeds ${MAX_V2_CHUNKS} entries`]);
    expect(bucket.head).toHaveBeenCalledTimes(1);
  });
});
