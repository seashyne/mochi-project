// D1 Database Service for Mochi Studio Project Drafts Persistence

export interface StudioDraftRecord {
  id: string;
  creatorId: string;
  gameId: string | null;
  title: string;
  description: string | null;
  slug: string | null;
  manifestJson: string;
  manifestKey: string | null;
  manifestHash: string | null;
  manifestSize: number | null;
  versionNumber: string;
  isAutosave: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveDraftRequest {
  id?: string;
  gameId?: string;
  title: string;
  description?: string;
  slug?: string;
  manifestJson: string;
  versionNumber?: string;
  isAutosave?: boolean;
}

interface StudioDraftRow {
  id: string;
  creator_id: string;
  game_id: string | null;
  title: string;
  description: string | null;
  slug: string | null;
  manifest_json: string;
  manifest_key: string | null;
  manifest_hash: string | null;
  manifest_size: number | null;
  version_number: string;
  is_autosave: number;
  created_at: string;
  updated_at: string;
}

function mapDraftRow(row: StudioDraftRow): StudioDraftRecord {
  return {
    id: row.id,
    creatorId: row.creator_id,
    gameId: row.game_id,
    title: row.title,
    description: row.description,
    slug: row.slug,
    manifestJson: row.manifest_json,
    manifestKey: row.manifest_key,
    manifestHash: row.manifest_hash,
    manifestSize: row.manifest_size,
    versionNumber: row.version_number,
    isAutosave: row.is_autosave === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function saveStudioDraft(
  db: D1Database,
  draft: StudioDraftRecord
): Promise<StudioDraftRecord> {
  const query = `
    INSERT INTO studio_project_drafts (
      id, creator_id, game_id, title, description, slug, manifest_json,
      manifest_key, manifest_hash, manifest_size, version_number, is_autosave, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      slug = excluded.slug,
      manifest_json = excluded.manifest_json,
      manifest_key = excluded.manifest_key,
      manifest_hash = excluded.manifest_hash,
      manifest_size = excluded.manifest_size,
      version_number = excluded.version_number,
      is_autosave = excluded.is_autosave,
      updated_at = excluded.updated_at
  `;

  await db
    .prepare(query)
    .bind(
      draft.id,
      draft.creatorId,
      draft.gameId || null,
      draft.title,
      draft.description || null,
      draft.slug || null,
      draft.manifestJson,
      draft.manifestKey || null,
      draft.manifestHash || null,
      draft.manifestSize ?? null,
      draft.versionNumber || '0.1.0',
      draft.isAutosave ? 1 : 0,
      draft.createdAt,
      draft.updatedAt
    )
    .run();

  return draft;
}

export async function findStudioDraftById(
  db: D1Database,
  id: string
): Promise<StudioDraftRecord | null> {
  const row = await db
    .prepare('SELECT * FROM studio_project_drafts WHERE id = ? LIMIT 1')
    .bind(id)
    .first<StudioDraftRow>();

  return row ? mapDraftRow(row) : null;
}

export async function listStudioDraftsByCreator(
  db: D1Database,
  creatorId: string,
  limit: number = 50
): Promise<StudioDraftRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM studio_project_drafts WHERE creator_id = ? ORDER BY updated_at DESC LIMIT ?')
    .bind(creatorId, limit)
    .all<StudioDraftRow>();

  return (rows.results || []).map(mapDraftRow);
}

/** Drafts shared with a creator through Team Create (excluding their own). */
export async function listSharedStudioDrafts(
  db: D1Database,
  userId: string,
  limit: number = 50
): Promise<StudioDraftRecord[]> {
  const rows = await db
    .prepare(
      `SELECT d.* FROM studio_project_drafts d
       INNER JOIN studio_collaborators c ON c.map_id = d.id
       WHERE c.user_id = ? AND d.creator_id <> ?
       ORDER BY d.updated_at DESC LIMIT ?`
    )
    .bind(userId, userId, limit)
    .all<StudioDraftRow>();

  return (rows.results || []).map(mapDraftRow);
}

export async function deleteStudioDraft(
  db: D1Database,
  id: string,
  creatorId: string
): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM studio_project_drafts WHERE id = ? AND creator_id = ?')
    .bind(id, creatorId)
    .run();

  return Boolean(res.meta && res.meta.changes && res.meta.changes > 0);
}
