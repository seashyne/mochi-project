// D1 persistence for asset access keys. One key per file, issued when the bytes
// are registered so a scene can never reference an upload that does not exist.

import { generateAccessId, type AccessKeyRecord, type AccessKeyStatus } from './assetAccessKeys';

interface AccessKeyRow {
  access_id: string;
  file_id: string;
  owner_id: string;
  status: string;
  created_at: string;
}

function mapKey(row: AccessKeyRow): AccessKeyRecord {
  return {
    accessId: row.access_id,
    fileId: row.file_id,
    ownerId: row.owner_id,
    status: row.status as AccessKeyStatus,
    createdAt: row.created_at
  };
}

export async function findAccessKey(db: D1Database, accessId: string): Promise<AccessKeyRecord | null> {
  const row = await db
    .prepare('SELECT * FROM asset_access_keys WHERE access_id = ?')
    .bind(accessId)
    .first<AccessKeyRow>();
  return row ? mapKey(row) : null;
}

export async function findAccessKeyByFile(
  db: D1Database,
  fileId: string
): Promise<AccessKeyRecord | null> {
  const row = await db
    .prepare('SELECT * FROM asset_access_keys WHERE file_id = ?')
    .bind(fileId)
    .first<AccessKeyRow>();
  return row ? mapKey(row) : null;
}

export async function listAccessKeysByOwner(
  db: D1Database,
  ownerId: string
): Promise<AccessKeyRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM asset_access_keys WHERE owner_id = ? ORDER BY created_at DESC')
    .bind(ownerId)
    .all<AccessKeyRow>();
  return (rows.results || []).map(mapKey);
}

interface AccessKeyWithFileRow extends AccessKeyRow {
  file_name: string;
  file_kind: string;
  object_key: string;
  visibility: string;
}

export interface AccessKeyWithFile extends AccessKeyRecord {
  name: string;
  kind: string;
  objectKey: string;
  visibility: string;
}

// Single joined query so the client can render an upload picker without N+1
// round trips per key.
export async function listAccessKeysWithFiles(
  db: D1Database,
  ownerId: string
): Promise<AccessKeyWithFile[]> {
  const rows = await db
    .prepare(
      `SELECT k.*, f.name AS file_name, f.kind AS file_kind, f.object_key AS object_key, f.visibility AS visibility
       FROM asset_access_keys k
       JOIN asset_files f ON f.id = k.file_id
       WHERE k.owner_id = ?
       ORDER BY k.created_at DESC`
    )
    .bind(ownerId)
    .all<AccessKeyWithFileRow>();

  return (rows.results || []).map((row) => ({
    ...mapKey(row),
    name: row.file_name,
    kind: row.file_kind,
    objectKey: row.object_key,
    visibility: row.visibility
  }));
}

// Idempotent: returns the existing key for a file, otherwise inserts a fresh one.
export async function issueAccessKey(
  db: D1Database,
  fileId: string,
  ownerId: string,
  now = new Date().toISOString()
): Promise<AccessKeyRecord> {
  const existing = await findAccessKeyByFile(db, fileId);
  if (existing) return existing;

  const record: AccessKeyRecord = {
    accessId: generateAccessId(),
    fileId,
    ownerId,
    status: 'ready',
    createdAt: now
  };

  try {
    await db
      .prepare(
        'INSERT INTO asset_access_keys (access_id, file_id, owner_id, status, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(record.accessId, record.fileId, record.ownerId, record.status, record.createdAt)
      .run();
    return record;
  } catch {
    // Concurrent insert won the race; return the stored key instead of failing.
    const raced = await findAccessKeyByFile(db, fileId);
    return raced ?? record;
  }
}

export async function setAccessKeyStatus(
  db: D1Database,
  accessId: string,
  ownerId: string,
  status: AccessKeyStatus
): Promise<boolean> {
  const res = await db
    .prepare('UPDATE asset_access_keys SET status = ? WHERE access_id = ? AND owner_id = ?')
    .bind(status, accessId, ownerId)
    .run();
  return Boolean(res.meta?.changes);
}

export async function deleteAccessKey(db: D1Database, fileId: string): Promise<void> {
  await db.prepare('DELETE FROM asset_access_keys WHERE file_id = ?').bind(fileId).run();
}
