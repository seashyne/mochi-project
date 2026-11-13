// Server-side validation for inline game manifests. Manifest v2 stays small:
// world chunks and binary assets are content-addressed R2 objects referenced by
// hash, so published games can total many gigabytes without large D1 rows.

import {
  validateAnimationClips,
  validateAnimationReferences,
  validateAnimationStateMachine
} from './animationValidation';

export const MAX_DRAFT_MANIFEST_BYTES = 64 * 1024;
export const MAX_PUBLISH_MANIFEST_BYTES = 256 * 1024;
export const MAX_V2_CHUNKS = 4096;
export const MAX_V2_ASSETS = 4096;
export const MAX_V2_CHUNK_BYTES = 64 * 1024 * 1024;

export interface ManifestAssetRef {
  hash: string;
  key: string;
  url: string;
  sizeBytes: number;
  contentType: string;
}

export interface ManifestInspection {
  valid: boolean;
  errors: string[];
  manifestVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isPositiveNumber(value: unknown, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}

function validateAssetRef(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!isSha256(value.hash)) errors.push(`${label}.hash must be a sha256 digest`);
  if (typeof value.key !== 'string' || !value.key) errors.push(`${label}.key is required`);
  if (typeof value.url !== 'string' || !value.url) errors.push(`${label}.url is required`);
  if (!isPositiveNumber(value.sizeBytes, 900 * 1024 * 1024 * 1024)) {
    errors.push(`${label}.sizeBytes is out of range`);
  }
  if (typeof value.contentType !== 'string' || !value.contentType) {
    errors.push(`${label}.contentType is required`);
  }
}

function validateBounds(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value) || !isRecord(value.bounds)) {
    errors.push(`${label}.bounds is required`);
    return;
  }
  const { min, max } = value.bounds as { min?: unknown; max?: unknown };
  const vectors = [min, max];
  for (const vec of vectors) {
    if (!isRecord(vec)) {
      errors.push(`${label}.bounds must contain finite min/max vectors`);
      return;
    }
    const isValid = ['x', 'y', 'z'].every((axis) => {
      const coord = vec[axis];
      return typeof coord === 'number' && Number.isFinite(coord);
    });
    if (!isValid) {
      errors.push(`${label}.bounds must contain finite min/max vectors`);
      return;
    }
  }
  const minVec = min as Record<'x' | 'y' | 'z', number>;
  const maxVec = max as Record<'x' | 'y' | 'z', number>;
  if (
    minVec.x > maxVec.x ||
    minVec.y > maxVec.y ||
    minVec.z > maxVec.z
  ) {
    errors.push(`${label}.bounds min must not exceed max`);
  }
}

// Also validates fully expanded external indexes, without the inline JSON ceiling.
export function validateManifestV2(root: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof root.title !== 'string' || !root.title.trim()) errors.push('title is required');
  if (typeof root.version !== 'string' || !root.version.trim()) errors.push('version is required');
  if (typeof root.scriptCode === 'string' && root.scriptCode.length > 256 * 1024) {
    errors.push('scriptCode exceeds the 256KB inline script ceiling');
  }

  if (!isRecord(root.chunking) || root.chunking.strategy !== 'grid') {
    errors.push('chunking.strategy must be "grid"');
  } else {
    const cellSize = root.chunking.cellSize;
    const limit = root.chunking.objectLimitPerChunk;
    if (typeof cellSize !== 'number' || !Number.isFinite(cellSize) || cellSize < 8 || cellSize > 1024) {
      errors.push('chunking.cellSize must be between 8 and 1024');
    }
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      errors.push('chunking.objectLimitPerChunk must be between 1 and 1000');
    }
  }

  const chunks = Array.isArray(root.chunks) ? root.chunks : [];
  if (root.chunks !== undefined && !Array.isArray(root.chunks)) {
    errors.push('chunks must be an array');
  }
  if (chunks.length > MAX_V2_CHUNKS) return [...errors, `chunks exceeds ${MAX_V2_CHUNKS} entries`];
  if (chunks.length === 0 && !root.chunkIndex) {
    errors.push('manifest must include chunks or a chunkIndex reference');
  }
  if (root.chunkIndex !== undefined) validateAssetRef(root.chunkIndex, 'chunkIndex', errors);
  if (root.assetIndex !== undefined) validateAssetRef(root.assetIndex, 'assetIndex', errors);

  const chunkIds = new Set<string>();
  chunks.forEach((chunk, index) => {
    const label = `chunks[${index}]`;
    validateAssetRef(chunk, label, errors);
    if (!isRecord(chunk)) return;
    if (typeof chunk.id !== 'string' || !chunk.id || chunk.id.length > 128) {
      errors.push(`${label}.id is required`);
    } else if (chunkIds.has(chunk.id)) {
      errors.push(`${label}.id is duplicated`);
    } else {
      chunkIds.add(chunk.id);
    }
    const objectCount = chunk.objectCount;
    if (
      typeof objectCount !== 'number' ||
      !Number.isInteger(objectCount) ||
      objectCount < 1 ||
      objectCount > 1000
    ) {
      errors.push(`${label}.objectCount is out of range`);
    }
    const chunkSize = chunk.sizeBytes;
    if (typeof chunkSize === 'number' && chunkSize > MAX_V2_CHUNK_BYTES) {
      errors.push(`${label}.sizeBytes exceeds the 64MB chunk ceiling`);
    }
    validateBounds(chunk, label, errors);
  });

  const assets = Array.isArray(root.assets) ? root.assets : [];
  if (root.assets !== undefined && !Array.isArray(root.assets)) {
    errors.push('assets must be an array');
  }
  if (assets.length > MAX_V2_ASSETS) return [...errors, `assets exceeds ${MAX_V2_ASSETS} entries`];
  assets.forEach((asset, index) => validateAssetRef(asset, `assets[${index}]`, errors));

  errors.push(...validateAnimationClips(root.animations));
  errors.push(...validateAnimationStateMachine(root.animationStateMachine));
  errors.push(...validateAnimationReferences(root));

  return errors;
}

export function inspectManifest(
  manifestJson: string,
  maxBytes = MAX_PUBLISH_MANIFEST_BYTES
): ManifestInspection {
  if (typeof manifestJson !== 'string' || !manifestJson.trim()) {
    return { valid: false, errors: ['manifestJson is required'], manifestVersion: 'unknown' };
  }
  if (new TextEncoder().encode(manifestJson).length > maxBytes) {
    return {
      valid: false,
      errors: [`manifestJson exceeds the ${maxBytes} byte ceiling`],
      manifestVersion: 'unknown'
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestJson);
  } catch {
    return { valid: false, errors: ['manifestJson is not valid JSON'], manifestVersion: 'unknown' };
  }
  if (!isRecord(parsed)) {
    return { valid: false, errors: ['manifestJson must be a JSON object'], manifestVersion: 'unknown' };
  }

  const version = String(parsed.manifestVersion || '1.0');
  // v1 manifests are inline JSON: same animation rules, no chunk/asset graph.
  const errors = version === '2.0'
    ? validateManifestV2(parsed)
    : [
        ...validateAnimationClips(parsed.animations),
        ...validateAnimationStateMachine(parsed.animationStateMachine),
        ...validateAnimationReferences(parsed)
      ];
  return { valid: errors.length === 0, errors, manifestVersion: version };
}
