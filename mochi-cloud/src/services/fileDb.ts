// D1 data layer for the creator file registry: folder tree plus asset
// metadata and visibility. R2 bytes remain content-addressed and shared;
// these rows carry ownership and access, never the binary payload.

export type AssetVisibility = 'private' | 'unlisted' | 'public';
export type AssetKind = 'model' | 'image' | 'audio' | 'video' | 'script' | 'other';

export const ASSET_VISIBILITIES: AssetVisibility[] = ['private', 'unlisted', 'public'];
export const ASSET_KINDS: AssetKind[] = ['model', 'image', 'audio', 'video', 'script', 'other'];
export const SYSTEM_OWNER_ID = 'system';

export interface AssetFolderRecord {
  id: string;
  ownerId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetFileRecord {
  id: string;
  ownerId: string;
  folderId: string | null;
  name: string;
  kind: AssetKind;
  objectKey: string;
  hash: string;
  sizeBytes: number;
  contentType: string;
  visibility: AssetVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface ListFilesFilter {
  folderId?: string | null;
  kind?: AssetKind;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface FileUpdate {
  name?: string;
  folderId?: string | null;
  visibility?: AssetVisibility;
}

interface FolderRow {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  kind: string;
  object_key: string;
  hash: string;
  size_bytes: number;
  content_type: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export function kindFromContentType(contentType: string): AssetKind {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === 'model/gltf-binary' || mime === 'model/gltf+json') return 'model';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/lua' || mime === 'text/x-lua' || mime === 'text/lua') return 'script';
  return 'other';
}

function mapFolder(row: FolderRow): AssetFolderRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFile(row: FileRow): AssetFileRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    folderId: row.folder_id,
    name: row.name,
    kind: row.kind as AssetKind,
    objectKey: row.object_key,
    hash: row.hash,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    visibility: row.visibility as AssetVisibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createFolder(db: D1Database, folder: AssetFolderRecord): Promise<AssetFolderRecord> {
  await db
    .prepare('INSERT INTO asset_folders (id, owner_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(folder.id, folder.ownerId, folder.name, folder.parentId, folder.createdAt, folder.updatedAt)
    .run();
  return folder;
}

export async function findFolderById(db: D1Database, id: string): Promise<AssetFolderRecord | null> {
  const row = await db.prepare('SELECT * FROM asset_folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  return row ? mapFolder(row) : null;
}

export async function listFoldersByOwner(db: D1Database, ownerId: string, limit = 500): Promise<AssetFolderRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM asset_folders WHERE owner_id = ? ORDER BY name LIMIT ?')
    .bind(ownerId, limit)
    .all<FolderRow>();
  return (rows.results || []).map(mapFolder);
}

export async function renameFolder(db: D1Database, id: string, ownerId: string, name: string, updatedAt: string): Promise<boolean> {
  const res = await db
    .prepare('UPDATE asset_folders SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(name, updatedAt, id, ownerId)
    .run();
  return Boolean(res.meta?.changes);
}

export async function deleteFolder(db: D1Database, id: string, ownerId: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM asset_folders WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .run();
  return Boolean(res.meta?.changes);
}

export async function registerFile(db: D1Database, file: AssetFileRecord): Promise<AssetFileRecord> {
  await db
    .prepare(`
      INSERT INTO asset_files (
        id, owner_id, folder_id, name, kind, object_key, hash, size_bytes,
        content_type, visibility, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      file.id, file.ownerId, file.folderId, file.name, file.kind, file.objectKey,
      file.hash, file.sizeBytes, file.contentType, file.visibility, file.createdAt, file.updatedAt
    )
    .run();
  return file;
}

export async function findFileById(db: D1Database, id: string): Promise<AssetFileRecord | null> {
  const row = await db.prepare('SELECT * FROM asset_files WHERE id = ? LIMIT 1').bind(id).first<FileRow>();
  return row ? mapFile(row) : null;
}

export async function findFilesByObjectKey(db: D1Database, objectKey: string, limit = 50): Promise<AssetFileRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM asset_files WHERE object_key = ? LIMIT ?')
    .bind(objectKey, limit)
    .all<FileRow>();
  return (rows.results || []).map(mapFile);
}

export async function findFileByOwnerAndKey(db: D1Database, ownerId: string, objectKey: string): Promise<AssetFileRecord | null> {
  const row = await db
    .prepare('SELECT * FROM asset_files WHERE owner_id = ? AND object_key = ? LIMIT 1')
    .bind(ownerId, objectKey)
    .first<FileRow>();
  return row ? mapFile(row) : null;
}

// Content-addressed bytes are shared; re-uploading the same object must not
// create duplicate registry rows for the same owner.
export async function registerUploadedFile(db: D1Database, file: AssetFileRecord): Promise<AssetFileRecord> {
  const existing = await findFileByOwnerAndKey(db, file.ownerId, file.objectKey);
  if (existing) return existing;
  return registerFile(db, file);
}

export async function listFilesByOwner(db: D1Database, ownerId: string, filter: ListFilesFilter = {}): Promise<AssetFileRecord[]> {
  const clauses = ['owner_id = ?'];
  const binds: unknown[] = [ownerId];
  if (filter.folderId === null) clauses.push('folder_id IS NULL');
  else if (typeof filter.folderId === 'string') { clauses.push('folder_id = ?'); binds.push(filter.folderId); }
  if (filter.kind) { clauses.push('kind = ?'); binds.push(filter.kind); }
  if (filter.search) {
    clauses.push("name LIKE ? ESCAPE '\\'");
    binds.push(`%${filter.search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
  }
  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);
  const rows = await db
    .prepare(`SELECT * FROM asset_files WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<FileRow>();
  return (rows.results || []).map(mapFile);
}

export async function updateFile(db: D1Database, id: string, ownerId: string, changes: FileUpdate, updatedAt: string): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (changes.name !== undefined) { sets.push('name = ?'); binds.push(changes.name); }
  if (changes.folderId !== undefined) { sets.push('folder_id = ?'); binds.push(changes.folderId); }
  if (changes.visibility !== undefined) { sets.push('visibility = ?'); binds.push(changes.visibility); }
  if (!sets.length) return false;
  sets.push('updated_at = ?');
  binds.push(updatedAt, id, ownerId);
  const res = await db
    .prepare(`UPDATE asset_files SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`)
    .bind(...binds)
    .run();
  return Boolean(res.meta?.changes);
}

export async function deleteFile(db: D1Database, id: string, ownerId: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM asset_files WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .run();
  return Boolean(res.meta?.changes);
}