// Validation for manifest v2 documents: structural limits, asset refs, chunk bounds
// and the script sections (client scriptCode, server scripts, remote event allowlist).

import type { ManifestAssetRef, ManifestBounds, MochiManifestV2 } from './manifestV2';
import type { StudioVec3 } from '../studio/types';
import { normalizeServerManifest } from '../scripting/serverManifest';
import { validateClip } from '../animation/clip';

export const MANIFEST_V2_MAX_CHUNKS = 4096;
export const MANIFEST_V2_MAX_ASSETS = 4096;
export const MANIFEST_V2_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const MANIFEST_V2_MAX_ASSET_BYTES = 900 * 1024 * 1024 * 1024;

export function isManifestV2(value: unknown): value is MochiManifestV2 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { manifestVersion?: unknown }).manifestVersion === '2.0'
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validateAssetRef(raw: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return [`${label} must be an object`];
  const ref = raw as Partial<ManifestAssetRef>;

  if (!isValidHash(ref.hash)) errors.push(`${label}.hash must be a sha256 digest`);
  if (typeof ref.key !== 'string' || !ref.key) errors.push(`${label}.key is required`);
  if (typeof ref.url !== 'string' || !ref.url) errors.push(`${label}.url is required`);
  const sizeOk = isFiniteNumber(ref.sizeBytes) && ref.sizeBytes > 0 && ref.sizeBytes <= MANIFEST_V2_MAX_ASSET_BYTES;
  if (!sizeOk) {
    errors.push(`${label}.sizeBytes is out of range`);
  }
  if (typeof ref.contentType !== 'string' || !ref.contentType) {
    errors.push(`${label}.contentType is required`);
  }
  return errors;
}

function isValidVec3(value: unknown): value is StudioVec3 {
  if (!value || typeof value !== 'object') return false;
  const vec = value as Record<string, unknown>;
  return isFiniteNumber(vec.x) && isFiniteNumber(vec.y) && isFiniteNumber(vec.z);
}

function validateBounds(raw: unknown, label: string): string[] {
  if (!raw || typeof raw !== 'object') return [`${label}.bounds is required`];
  const bounds = raw as Partial<ManifestBounds>;
  if (!isValidVec3(bounds.min) || !isValidVec3(bounds.max)) {
    return [`${label}.bounds must contain finite min/max vectors`];
  }
  if (
    bounds.min.x > bounds.max.x ||
    bounds.min.y > bounds.max.y ||
    bounds.min.z > bounds.max.z
  ) {
    return [`${label}.bounds min must not exceed max`];
  }
  return [];
}

/** Script-section rules: inline ceiling plus server script / remote event limits. */
function validateScripts(manifest: MochiManifestV2): string[] {
  const errors: string[] = [];
  if (typeof manifest.scriptCode === 'string' && manifest.scriptCode.length > 256 * 1024) {
    errors.push('scriptCode exceeds the 256KB inline script ceiling');
  }
  if (manifest.serverScripts !== undefined || manifest.remoteEvents !== undefined) {
    errors.push(...normalizeServerManifest(manifest).errors);
  }
  return errors;
}

const MANIFEST_V2_MAX_ANIMATIONS = 64;

function validateAnimations(manifest: MochiManifestV2): string[] {
  if (manifest.animations === undefined) return [];
  if (!Array.isArray(manifest.animations)) return ['animations must be an array'];
  const errors: string[] = [];
  if (manifest.animations.length > MANIFEST_V2_MAX_ANIMATIONS) {
    errors.push(`animations exceeds the ${MANIFEST_V2_MAX_ANIMATIONS} entry ceiling`);
  }
  manifest.animations.forEach((clip, index) => {
    for (const error of validateClip(clip)) errors.push(`animations[${index}]: ${error}`);
  });
  return errors;
}

export function validateManifestV2(value: unknown): string[] {
  if (!isManifestV2(value)) return ['manifestVersion must be "2.0"'];
  const errors: string[] = [];
  const manifest = value as MochiManifestV2;

  if (typeof manifest.title !== 'string' || !manifest.title.trim()) {
    errors.push('title is required');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    errors.push('version is required');
  }
  errors.push(...validateScripts(manifest));
  errors.push(...validateAnimations(manifest));

  const chunking = manifest.chunking;
  if (!chunking || chunking.strategy !== 'grid') {
    errors.push('chunking.strategy must be "grid"');
  } else {
    if (!isFiniteNumber(chunking.cellSize) || chunking.cellSize < 8 || chunking.cellSize > 1024) {
      errors.push('chunking.cellSize must be between 8 and 1024');
    }
    if (
      !isFiniteNumber(chunking.objectLimitPerChunk) ||
      chunking.objectLimitPerChunk < 1 ||
      chunking.objectLimitPerChunk > 1000
    ) {
      errors.push('chunking.objectLimitPerChunk must be between 1 and 1000');
    }
  }

  if (manifest.chunks !== undefined && !Array.isArray(manifest.chunks)) {
    errors.push('chunks must be an array');
  }
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  if (chunks.length > MANIFEST_V2_MAX_CHUNKS) {
    errors.push(`chunks exceeds the ${MANIFEST_V2_MAX_CHUNKS} entry ceiling`);
  }
  if (chunks.length === 0 && !manifest.chunkIndex) {
    errors.push('manifest must include chunks or a chunkIndex reference');
  }
  if (manifest.chunkIndex) {
    errors.push(...validateAssetRef(manifest.chunkIndex, 'chunkIndex'));
  }

  const seenChunkIds = new Set<string>();
  for (const chunk of chunks) {
    const label = `chunks[${seenChunkIds.size}]`;
    errors.push(...validateAssetRef(chunk, label));
    if (!chunk || typeof chunk !== 'object') continue;
    if (typeof chunk.id !== 'string' || !chunk.id || chunk.id.length > 128) {
      errors.push(`${label}.id is required`);
    } else if (seenChunkIds.has(chunk.id)) {
      errors.push(`${label}.id is duplicated`);
    } else {
      seenChunkIds.add(chunk.id);
    }
    if (!isFiniteNumber(chunk.objectCount) || chunk.objectCount < 1 || chunk.objectCount > 1000) {
      errors.push(`${label}.objectCount is out of range`);
    }
    if (isFiniteNumber(chunk.sizeBytes) && chunk.sizeBytes > MANIFEST_V2_MAX_CHUNK_BYTES) {
      errors.push(`${label}.sizeBytes exceeds the 64MB chunk ceiling`);
    }
    errors.push(...validateBounds(chunk.bounds, label));
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (manifest.assets !== undefined && !Array.isArray(manifest.assets)) {
    errors.push('assets must be an array');
  }
  if (assets.length > MANIFEST_V2_MAX_ASSETS) {
    errors.push(`assets exceeds the ${MANIFEST_V2_MAX_ASSETS} entry ceiling`);
  }
  assets.forEach((asset, index) => {
    errors.push(...validateAssetRef(asset, `assets[${index}]`));
  });

  return errors;
}
