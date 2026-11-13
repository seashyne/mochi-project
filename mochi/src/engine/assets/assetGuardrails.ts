// Import guardrails: an asset that breaks the budget is rejected at the door with a
// message naming the limit, instead of loading and quietly eating the frame budget.
//
// The binary scans (image headers, audio duration) run in the WASM kernel; the
// TypeScript versions here are the fallback and the reference the parity test
// compares against. GLB structure is read in TypeScript because JSON.parse is not
// the bottleneck - the accessor counts are already in the file.

import { audioDurationSeconds, imageDimensions } from './assetInspectors';

export { audioDurationSeconds, imageDimensions } from './assetInspectors';

export interface AssetLimits {
  /** Triangles in one model, summed over every primitive. */
  maxTriangles: number;
  /** Longest edge of any embedded texture, in pixels. */
  maxTextureSize: number;
  maxMeshes: number;
  maxBytes: number;
  /** Audio length, in seconds. */
  maxAudioSeconds: number;
}

export const DEFAULT_ASSET_LIMITS: AssetLimits = {
  maxTriangles: 50_000,
  maxTextureSize: 4096,
  maxMeshes: 256,
  maxBytes: 32 * 1024 * 1024,
  maxAudioSeconds: 300
};

export interface GlbStats {
  triangles: number;
  meshes: number;
  maxTextureSize: number;
  bytes: number;
}

export interface AssetViolation {
  rule: keyof AssetLimits;
  limit: number;
  actual: number;
  message: string;
}

export interface AssetReport {
  ok: boolean;
  stats: GlbStats | null;
  violations: AssetViolation[];
}

interface GlbDocument {
  json: Record<string, unknown>;
  buffer: ArrayBuffer;
  binaryOffset: number;
  binaryLength: number;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(buffer: ArrayBuffer): GlbDocument | null {
  if (buffer.byteLength < 20) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;

  const declared = view.getUint32(8, true);
  const limit = Math.min(declared, buffer.byteLength);
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let binaryOffset = 0;
  let binaryLength = 0;

  while (offset + 8 <= limit) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > buffer.byteLength) return null;
    if (type === CHUNK_JSON) {
      const text = new TextDecoder().decode(new Uint8Array(buffer, start, length));
      json = JSON.parse(text) as Record<string, unknown>;
    } else if (type === CHUNK_BIN) {
      binaryOffset = start;
      binaryLength = length;
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }

  return json ? { json, buffer, binaryOffset, binaryLength } : null;
}

function countTriangles(json: Record<string, unknown>): { triangles: number; meshes: number } {
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  let triangles = 0;

  for (const mesh of meshes) {
    const primitives = (mesh as { primitives?: unknown[] }).primitives;
    if (!Array.isArray(primitives)) continue;
    for (const primitive of primitives) {
      const record = primitive as { indices?: number; attributes?: Record<string, number> };
      const accessorIndex = typeof record.indices === 'number' ? record.indices : record.attributes?.POSITION;
      if (typeof accessorIndex !== 'number') continue;
      const accessor = accessors[accessorIndex] as { count?: number } | undefined;
      const count = typeof accessor?.count === 'number' ? accessor.count : 0;
      // Indexed primitives count three indices per triangle; a non-indexed
      // primitive counts three vertices per triangle.
      triangles += Math.floor(count / 3);
    }
  }

  return { triangles, meshes: meshes.length };
}

function maxEmbeddedTextureSize(document: GlbDocument): number {
  const images = Array.isArray(document.json.images) ? document.json.images : [];
  const views = Array.isArray(document.json.bufferViews) ? document.json.bufferViews : [];
  let maxSize = 0;

  for (const image of images) {
    const viewIndex = (image as { bufferView?: number }).bufferView;
    if (typeof viewIndex !== 'number') continue;
    const view = views[viewIndex] as { byteOffset?: number; byteLength?: number } | undefined;
    if (!view || typeof view.byteLength !== 'number') continue;
    const start = document.binaryOffset + (view.byteOffset ?? 0);
    if (start + view.byteLength > document.buffer.byteLength) continue;
    const bytes = new Uint8Array(document.buffer, start, view.byteLength);
    const size = imageDimensions(bytes);
    if (size) maxSize = Math.max(maxSize, size.width, size.height);
  }

  return maxSize;
}

function violation(
  rule: keyof AssetLimits,
  limit: number,
  actual: number,
  label: string,
  unit: string
): AssetViolation {
  return {
    rule,
    limit,
    actual,
    message: `${label} is ${actual}${unit}, over the ${limit}${unit} limit`
  };
}

/** Checks a GLB against the limits. `stats` is null when the file is not a GLB. */
export function validateModel(buffer: ArrayBuffer, limits: AssetLimits = DEFAULT_ASSET_LIMITS): AssetReport {
  const document = readGlb(buffer);
  if (!document) return { ok: false, stats: null, violations: [] };

  const counts = countTriangles(document.json);
  const stats: GlbStats = {
    triangles: counts.triangles,
    meshes: counts.meshes,
    maxTextureSize: maxEmbeddedTextureSize(document),
    bytes: buffer.byteLength
  };

  const violations: AssetViolation[] = [];
  if (stats.triangles > limits.maxTriangles) {
    violations.push(violation('maxTriangles', limits.maxTriangles, stats.triangles, 'Model', ' triangles'));
  }
  if (stats.meshes > limits.maxMeshes) {
    violations.push(violation('maxMeshes', limits.maxMeshes, stats.meshes, 'Mesh count', ''));
  }
  if (stats.maxTextureSize > limits.maxTextureSize) {
    violations.push(
      violation('maxTextureSize', limits.maxTextureSize, stats.maxTextureSize, 'Texture edge', ' px')
    );
  }
  if (stats.bytes > limits.maxBytes) {
    const mb = (value: number) => Math.round(value / (1024 * 1024));
    violations.push(
      violation('maxBytes', mb(limits.maxBytes), mb(stats.bytes), 'File size', ' MB')
    );
  }

  return { ok: violations.length === 0, stats, violations };
}

/** Checks an audio file's length. Unknown formats pass, because guessing is worse. */
export function validateAudio(buffer: ArrayBuffer, limits: AssetLimits = DEFAULT_ASSET_LIMITS): AssetReport {
  const bytes = new Uint8Array(buffer);
  const seconds = audioDurationSeconds(bytes);
  const violations: AssetViolation[] = [];

  if (seconds !== null && seconds > limits.maxAudioSeconds) {
    violations.push(
      violation(
        'maxAudioSeconds',
        limits.maxAudioSeconds,
        Math.round(seconds),
        'Audio length',
        ' s'
      )
    );
  }
  if (buffer.byteLength > limits.maxBytes) {
    const mb = (value: number) => Math.round(value / (1024 * 1024));
    violations.push(violation('maxBytes', mb(limits.maxBytes), mb(buffer.byteLength), 'File size', ' MB'));
  }

  return { ok: violations.length === 0, stats: null, violations };
}

/** One-line summary for a rejection toast or console line. */
export function describeViolations(report: AssetReport): string {
  return report.violations.map((entry) => entry.message).join('; ');
}
