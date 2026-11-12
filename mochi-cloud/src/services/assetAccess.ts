// Pure access-control policy for creator assets. No database or HTTP imports so
// the decision table can be exercised directly by adversarial tests.

import { sha256Hex } from './sha256';

export type Visibility = 'private' | 'unlisted' | 'public';
export type GranteeType = 'user' | 'public';
export type GrantPermission = 'read' | 'write';
export type AccessPermission = 'none' | 'read' | 'write' | 'owner';

export interface AccessGrant {
  id: string;
  fileId: string;
  ownerId: string;
  granteeType: GranteeType;
  granteeId: string | null;
  permission: GrantPermission;
  tokenHash: string | null;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AccessViewer {
  userId?: string | null;
  role?: string | null;
  shareTokenHash?: string | null;
}

export interface AccessSubject {
  ownerId: string;
  visibility: Visibility;
}

const RANK: Record<AccessPermission, number> = { none: 0, read: 1, write: 2, owner: 3 };

export function permissionRank(permission: AccessPermission): number {
  return RANK[permission] ?? 0;
}

export function strongerPermission(a: AccessPermission, b: AccessPermission): AccessPermission {
  return permissionRank(a) >= permissionRank(b) ? a : b;
}

export function canRead(permission: AccessPermission): boolean {
  return permissionRank(permission) >= RANK.read;
}

export function canWrite(permission: AccessPermission): boolean {
  return permissionRank(permission) >= RANK.write;
}

export function isGrantActive(grant: AccessGrant, nowIso: string): boolean {
  if (!grant.expiresAt) return true;
  const expiry = Date.parse(grant.expiresAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(expiry)) return false;
  if (!Number.isFinite(now)) return false;
  return expiry > now;
}

// Resolves the effective permission for a viewer. Owner and admin always win,
// public/unlisted visibility grants read, and matching grants can raise the
// level up to write.
export function evaluateFileAccess(
  subject: AccessSubject,
  viewer: AccessViewer,
  grants: AccessGrant[],
  nowIso: string
): AccessPermission {
  if (viewer.role === 'admin') return 'owner';
  if (viewer.userId && viewer.userId === subject.ownerId) return 'owner';

  let permission: AccessPermission = subject.visibility === 'private' ? 'none' : 'read';

  for (const grant of grants) {
    if (!isGrantActive(grant, nowIso)) continue;

    const matchesUser =
      grant.granteeType === 'user' &&
      Boolean(viewer.userId) &&
      grant.granteeId === viewer.userId &&
      !grant.tokenHash;

    const matchesOpenPublic = grant.granteeType === 'public' && !grant.tokenHash;

    const matchesToken =
      Boolean(grant.tokenHash) &&
      Boolean(viewer.shareTokenHash) &&
      grant.tokenHash === viewer.shareTokenHash;

    if (matchesUser || matchesOpenPublic || matchesToken) {
      permission = strongerPermission(permission, grant.permission);
    }
  }

  return permission;
}

export function createShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function hashShareToken(token: string): string {
  return sha256Hex(new TextEncoder().encode(token.trim()));
}

export interface GrantInput {
  granteeType: GranteeType;
  granteeId?: string | null;
  permission: GrantPermission;
  label?: string | null;
  expiresAt?: string | null;
  withToken?: boolean;
}

export function validateGrantInput(input: unknown): { error: string } | { value: GrantInput } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const granteeType = raw.granteeType;
  const permission = raw.permission;

  if (granteeType !== 'user' && granteeType !== 'public') {
    return { error: "granteeType must be 'user' or 'public'" };
  }
  if (permission !== 'read' && permission !== 'write') {
    return { error: "permission must be 'read' or 'write'" };
  }
  if (granteeType === 'user') {
    const granteeId = typeof raw.granteeId === 'string' ? raw.granteeId.trim() : '';
    if (!granteeId) return { error: 'granteeId is required for user grants' };
  }

  const expiresAt = typeof raw.expiresAt === 'string' ? raw.expiresAt.trim() : null;
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    return { error: 'expiresAt must be a valid ISO date' };
  }

  return {
    value: {
      granteeType,
      granteeId: typeof raw.granteeId === 'string' ? raw.granteeId.trim() : null,
      permission,
      label: typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : null,
      expiresAt,
      withToken: raw.withToken === true
    }
  };
}
