// D1 persistence for asset access grants. Mirrors the fileDb conventions:
// explicit column lists, snake_case rows mapped to camelCase records.

import type { AccessGrant, GranteeType, GrantPermission } from './assetAccess';

interface GrantRow {
  id: string;
  file_id: string;
  owner_id: string;
  grantee_type: string;
  grantee_id: string | null;
  permission: string;
  token_hash: string | null;
  label: string | null;
  expires_at: string | null;
  created_at: string;
}

function mapGrant(row: GrantRow): AccessGrant {
  return {
    id: row.id,
    fileId: row.file_id,
    ownerId: row.owner_id,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as GrantPermission,
    tokenHash: row.token_hash,
    label: row.label,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

export async function listGrantsForFile(db: D1Database, fileId: string): Promise<AccessGrant[]> {
  const rows = await db
    .prepare('SELECT * FROM asset_access_grants WHERE file_id = ? ORDER BY created_at DESC')
    .bind(fileId)
    .all<GrantRow>();
  return (rows.results || []).map(mapGrant);
}

export async function listGrantsForGrantee(db: D1Database, granteeId: string): Promise<AccessGrant[]> {
  const rows = await db
    .prepare("SELECT * FROM asset_access_grants WHERE grantee_type = 'user' AND grantee_id = ? ORDER BY created_at DESC")
    .bind(granteeId)
    .all<GrantRow>();
  return (rows.results || []).map(mapGrant);
}

export async function findGrantById(db: D1Database, id: string): Promise<AccessGrant | null> {
  const row = await db
    .prepare('SELECT * FROM asset_access_grants WHERE id = ?')
    .bind(id)
    .first<GrantRow>();
  return row ? mapGrant(row) : null;
}

export async function findGrantByTokenHash(db: D1Database, tokenHash: string): Promise<AccessGrant | null> {
  const row = await db
    .prepare('SELECT * FROM asset_access_grants WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<GrantRow>();
  return row ? mapGrant(row) : null;
}

export async function createGrant(db: D1Database, grant: AccessGrant): Promise<AccessGrant> {
  await db
    .prepare(
      `INSERT INTO asset_access_grants
       (id, file_id, owner_id, grantee_type, grantee_id, permission, token_hash, label, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      grant.id,
      grant.fileId,
      grant.ownerId,
      grant.granteeType,
      grant.granteeId,
      grant.permission,
      grant.tokenHash,
      grant.label,
      grant.expiresAt,
      grant.createdAt
    )
    .run();
  return grant;
}

export async function deleteGrant(db: D1Database, id: string, ownerId: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM asset_access_grants WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .run();
  return Boolean(res.meta?.changes);
}

export async function deleteGrantsForFile(db: D1Database, fileId: string): Promise<void> {
  await db.prepare('DELETE FROM asset_access_grants WHERE file_id = ?').bind(fileId).run();
}
