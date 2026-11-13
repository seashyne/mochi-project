// Shared constants and helpers for resumable multipart asset uploads.

import { MochiEnv } from '../types/env';
import { signToken, verifyToken } from '../middleware/auth';

const MIB = 1024 * 1024;

// Content-addressed keys never change, so the public bucket can cache them
// forever. SVG is excluded because it can carry script into the asset origin.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const ALLOWED_TYPE_PREFIXES = ['model/', 'image/', 'audio/', 'video/', 'font/'];
const ALLOWED_EXACT_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'application/zip',
  'application/x-mochi',
  'text/plain'
]);

export function isAllowedContentType(value: string): boolean {
  const type = value.split(';')[0].trim().toLowerCase();
  if (type === 'image/svg+xml') return false;
  return (
    ALLOWED_EXACT_TYPES.has(type) ||
    ALLOWED_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix))
  );
}

// Content types a browser may render inline from the asset origin. Anything else
// is served as an attachment, so a stray HTML or XML file cannot become a document
// that runs on the asset domain.
const INLINE_SAFE_PREFIXES = ['model/', 'image/', 'audio/', 'video/', 'font/'];

export function isInlineSafeContentType(value: string): boolean {
  const type = value.split(';')[0].trim().toLowerCase();
  // SVG can carry script; it is refused at upload and never served inline.
  if (type === 'image/svg+xml') return false;
  return INLINE_SAFE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

// 64 MiB parts stay under the Cloudflare Worker request body limit while
// keeping the part count low for multi-gigabyte assets.
export const MIN_PART_SIZE_BYTES = 64 * MIB;
export const MAX_ASSET_BYTES = 900 * 1024 * MIB; // 900 GiB
export const MAX_PARTS = 10_000;

export interface AssetUploadTokenPayload {
  scope: 'asset_upload';
  key: string;
  uploadId: string;
  sizeBytes: number;
  contentType: string;
  userId: string;
  filename?: string;
  sha256?: string;
  iat?: number;
  exp?: number;
}

export function isValidSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || 'asset.bin';
}

export function buildAssetKey(
  userId: string,
  filename: string,
  sha256?: string
): string {
  if (sha256 && isValidSha256(sha256)) {
    return `assets/sha256/${sha256.toLowerCase()}`;
  }
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return `assets/uploads/${safeUser}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
}

export function computePartSize(sizeBytes: number): number {
  const required = Math.ceil(sizeBytes / MAX_PARTS / MIB) * MIB;
  return Math.max(MIN_PART_SIZE_BYTES, required);
}

export function computeTotalParts(sizeBytes: number, partSize: number): number {
  return Math.max(1, Math.ceil(sizeBytes / partSize));
}

export function resolvePublicUrl(env: Pick<MochiEnv, 'PUBLIC_ASSETS_URL'>, key: string): string {
  const base = env.PUBLIC_ASSETS_URL || 'https://assets-game.lenout.com';
  return `${base.replace(/\/+$/, '')}/${key}`;
}

// Creator-uploaded content is served from its own origin so the asset domain can
// be rebound (or moved behind a new CDN) without touching game bundles. The path
// deliberately goes through the Worker gate so private uploads stay protected.
export function resolveAccessAssetUrl(
  env: Pick<MochiEnv, 'ACCESS_ASSETS_URL'>,
  key: string
): string {
  const base = env.ACCESS_ASSETS_URL || 'https://access-game.lenout.com';
  const cleanKey = key.replace(/^\/+/, '');
  return `${base.replace(/\/+$/, '')}/api/v1/assets/file/${cleanKey}`;
}

export function resolveSecret(env: MochiEnv): string {
  return env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
}

export async function signUploadToken(
  env: MochiEnv,
  payload: Omit<AssetUploadTokenPayload, 'scope' | 'iat' | 'exp'>,
  expiresInSeconds = 86400
): Promise<string> {
  return signToken(
    { ...payload, scope: 'asset_upload' },
    resolveSecret(env),
    expiresInSeconds
  );
}

export async function verifyUploadToken(
  env: MochiEnv,
  token: string | undefined
): Promise<AssetUploadTokenPayload | null> {
  if (!token) return null;
  const payload = await verifyToken<AssetUploadTokenPayload>(
    token,
    resolveSecret(env)
  );
  if (!payload || payload.scope !== 'asset_upload') return null;
  return payload;
}

export function validateAssetRequest(input: {
  filename?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
}): string | null {
  if (typeof input.filename !== 'string' || !input.filename.trim()) {
    return 'filename is required';
  }
  if (typeof input.contentType !== 'string' || !input.contentType.trim()) {
    return 'contentType is required';
  }
  if (!isAllowedContentType(input.contentType)) {
    return 'contentType is not allowed';
  }
  if (
    typeof input.sizeBytes !== 'number' ||
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return 'sizeBytes must be a positive number';
  }
  if (input.sizeBytes > MAX_ASSET_BYTES) {
    return `sizeBytes exceeds the ${MAX_ASSET_BYTES} byte asset ceiling`;
  }
  if (input.sha256 !== undefined && !isValidSha256(input.sha256)) {
    return 'sha256 must be a 64-character hexadecimal digest';
  }
  return null;
}

export function normalizeParts(
  parts: unknown,
  totalParts: number
): Array<{ partNumber: number; etag: string }> | null {
  if (!Array.isArray(parts) || parts.length !== totalParts) return null;
  const normalized: Array<{ partNumber: number; etag: string }> = [];
  const seen = new Set<number>();

  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as { partNumber?: unknown; etag?: unknown };
    if (
      typeof entry.partNumber !== 'number' ||
      !Number.isInteger(entry.partNumber) ||
      entry.partNumber < 1 ||
      entry.partNumber > totalParts ||
      seen.has(entry.partNumber)
    ) {
      return null;
    }
    if (
      typeof entry.etag !== 'string' ||
      !entry.etag ||
      entry.etag.length > 256
    ) {
      return null;
    }
    seen.add(entry.partNumber);
    normalized.push({ partNumber: entry.partNumber, etag: entry.etag });
  }

  normalized.sort((a, b) => a.partNumber - b.partNumber);
  return normalized;
}
