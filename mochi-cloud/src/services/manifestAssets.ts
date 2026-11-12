// Expand and validate v2 publication references before any D1 version write.
import { MochiEnv } from '../types/env';
import { isAllowedContentType, resolvePublicUrl } from './assetPipeline';
import { MAX_WHOLE_HASH_BYTES } from './assetIntegrity';
import {
  inspectManifest, ManifestAssetRef, validateManifestV2
} from './manifestValidation';
import { AssetReferenceError, verifyManifestAsset } from './manifestAssetStorage';

function indexEntries(value: unknown, name: 'chunks' | 'assets'): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const index = value as Record<string, unknown>;
    if (index.chunkIndex !== undefined || index.assetIndex !== undefined) {
      throw new AssetReferenceError(`${name} index must not contain nested indexes`);
    }
    if (Array.isArray(index[name])) return index[name];
  }
  throw new AssetReferenceError(`${name} index must be an array or an object containing a ${name} array`);
}

export async function validateManifestAssets(
  env: Pick<MochiEnv, 'ASSETS' | 'PUBLIC_ASSETS_URL'>,
  manifestJson: string
): Promise<string[]> {
  const inspection = inspectManifest(manifestJson);
  if (!inspection.valid) return inspection.errors;
  if (inspection.manifestVersion !== '2.0') return []; // Legacy v1 remains unchanged.
  const root = JSON.parse(manifestJson) as Record<string, unknown>;
  const references = new Map<string, ManifestAssetRef>();
  const verifiedIndexes = new Map<string, unknown>();
  const budget = { remainingBytes: MAX_WHOLE_HASH_BYTES };

  function register(ref: ManifestAssetRef): void {
    if (ref.key !== `assets/sha256/${ref.hash.toLowerCase()}`) {
      throw new AssetReferenceError(`${ref.key}: key must match the content-addressed SHA-256`);
    }
    if (ref.url !== resolvePublicUrl(env, ref.key)) {
      throw new AssetReferenceError(`${ref.key}: url must match the canonical public asset URL`);
    }
    if (!isAllowedContentType(ref.contentType)) {
      throw new AssetReferenceError(`${ref.key}: content type is not allowed`);
    }
    const previous = references.get(ref.key);
    if (previous && (previous.hash.toLowerCase() !== ref.hash.toLowerCase() ||
      previous.sizeBytes !== ref.sizeBytes || previous.contentType !== ref.contentType ||
      previous.url !== ref.url)) {
      throw new AssetReferenceError(`${ref.key}: conflicting reference definitions`);
    }
    references.set(ref.key, ref);
  }

  async function expand(name: 'chunks' | 'assets', ref: ManifestAssetRef | undefined): Promise<unknown[]> {
    if (!ref) return [];
    if (ref.contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new AssetReferenceError(`${name} index content type must be application/json`);
    }
    if (!verifiedIndexes.has(ref.key)) {
      const bytes = await verifyManifestAsset(env.ASSETS, ref, budget, true);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
      } catch {
        throw new AssetReferenceError(`${name} index is not valid UTF-8 JSON`);
      }
      verifiedIndexes.set(ref.key, parsed);
    }
    return indexEntries(verifiedIndexes.get(ref.key), name);
  }

  try {
    const chunks = (root.chunks ?? []) as ManifestAssetRef[];
    const assets = (root.assets ?? []) as ManifestAssetRef[];
    const chunkIndex = root.chunkIndex as ManifestAssetRef | undefined;
    const assetIndex = root.assetIndex as ManifestAssetRef | undefined;
    // Reject conflicting/cross-origin inline definitions before touching R2.
    for (const ref of [...chunks, ...assets, ...(chunkIndex ? [chunkIndex] : []), ...(assetIndex ? [assetIndex] : [])]) {
      register(ref);
    }
    const expandedChunks = [...chunks, ...await expand('chunks', chunkIndex)];
    const expandedAssets = [...assets, ...await expand('assets', assetIndex)];
    const errors = validateManifestV2({
      ...root, chunkIndex: undefined, assetIndex: undefined,
      chunks: expandedChunks, assets: expandedAssets
    });
    if (errors.length) return errors;
    // Structural validation covers aggregate counts, bounds, byte sizes and
    // chunk IDs across both inline and external definitions, before R2 reads.
    for (const ref of [...expandedChunks, ...expandedAssets] as ManifestAssetRef[]) register(ref);
    for (const ref of references.values()) {
      if (!verifiedIndexes.has(ref.key)) await verifyManifestAsset(env.ASSETS, ref, budget);
    }
    return [];
  } catch (error) {
    if (error instanceof AssetReferenceError) return [error.message];
    throw error; // R2 outages are server failures, never successful validation.
  }
}
