// Asset access keys: the opaque handle a creator references in a scene once the
// underlying bytes are uploaded. Pure policy + id generation, no database.

import { canRead, evaluateFileAccess, type AccessGrant, type AccessViewer } from './assetAccess';

export type AccessKeyStatus = 'pending' | 'ready' | 'blocked';

export interface AccessKeyRecord {
  accessId: string;
  fileId: string;
  ownerId: string;
  status: AccessKeyStatus;
  createdAt: string;
}

export type ResolveFailure = 'not_found' | 'pending' | 'blocked' | 'forbidden';

export type ResolveResult =
  | { ok: true; key: AccessKeyRecord }
  | { ok: false; reason: ResolveFailure };

export const ACCESS_ID_PATTERN = /^acc_[0-9a-f]{20}$/;

export function generateAccessId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `acc_${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function isValidAccessId(value: unknown): value is string {
  return typeof value === 'string' && ACCESS_ID_PATTERN.test(value.trim());
}

// A key is usable only when it exists, the bytes finished uploading, and the
// viewer is allowed to read the backing file.
export function resolveAccessKey(
  key: AccessKeyRecord | null,
  subject: { ownerId: string; visibility: 'private' | 'unlisted' | 'public' } | null,
  viewer: AccessViewer,
  grants: AccessGrant[],
  nowIso: string
): ResolveResult {
  if (!key) return { ok: false, reason: 'not_found' };
  if (key.status === 'pending') return { ok: false, reason: 'pending' };
  if (key.status === 'blocked') return { ok: false, reason: 'blocked' };
  if (!subject) return { ok: false, reason: 'not_found' };

  const permission = evaluateFileAccess(subject, viewer, grants, nowIso);
  if (!canRead(permission)) return { ok: false, reason: 'forbidden' };
  return { ok: true, key };
}

export function statusToHttpCode(reason: ResolveFailure): 403 | 404 | 409 {
  switch (reason) {
    case 'forbidden':
      return 403;
    case 'pending':
    case 'blocked':
      return 409;
    default:
      return 404;
  }
}

export function describeFailure(reason: ResolveFailure): string {
  switch (reason) {
    case 'pending':
      return 'Asset upload has not finished yet';
    case 'blocked':
      return 'Asset access has been blocked by its owner';
    case 'forbidden':
      return 'You do not have access to this asset';
    default:
      return 'Unknown asset access id';
  }
}
