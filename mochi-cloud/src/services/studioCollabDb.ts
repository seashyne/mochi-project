// D1 service for Team Create: who may join a live collaborative edit session
// on a studio draft. The draft creator is the implicit owner; everyone else
// needs a studio_collaborators row (editor or viewer).

export type CollabRole = 'editor' | 'viewer';

export interface StudioCollaborator {
  userId: string;
  username: string;
  role: CollabRole;
  invitedBy: string | null;
  createdAt: string;
}

export interface TeamSession {
  mapId: string;
  ownerId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TeamSessionRow {
  map_id: string;
  owner_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapSession(row: TeamSessionRow): TeamSession {
  return {
    mapId: row.map_id,
    ownerId: row.owner_id,
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface CollaboratorRow {
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

interface CollaboratorWithUsernameRow extends CollaboratorRow {
  username: string;
}

function mapRow(row: CollaboratorWithUsernameRow): StudioCollaborator {
  return {
    userId: row.user_id,
    username: row.username,
    role: row.role === 'viewer' ? 'viewer' : 'editor',
    invitedBy: row.invited_by,
    createdAt: row.created_at
  };
}

export async function listCollaborators(
  db: D1Database,
  mapId: string
): Promise<StudioCollaborator[]> {
  const result = await db
    .prepare(
      `SELECT c.user_id, c.role, c.invited_by, c.created_at, u.username
       FROM studio_collaborators c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.map_id = ?
       ORDER BY c.created_at ASC`
    )
    .bind(mapId)
    .all<CollaboratorWithUsernameRow>();
  return (result.results || []).map(mapRow);
}

export async function findCollaborator(
  db: D1Database,
  mapId: string,
  userId: string
): Promise<CollabRole | null> {
  const row = await db
    .prepare('SELECT role FROM studio_collaborators WHERE map_id = ? AND user_id = ?')
    .bind(mapId, userId)
    .first<{ role: string }>();
  if (!row) return null;
  return row.role === 'viewer' ? 'viewer' : 'editor';
}

export async function upsertCollaborator(
  db: D1Database,
  mapId: string,
  userId: string,
  role: CollabRole,
  invitedBy: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO studio_collaborators (map_id, user_id, role, invited_by, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(map_id, user_id) DO UPDATE SET role = excluded.role`
    )
    .bind(mapId, userId, role, invitedBy, new Date().toISOString())
    .run();
}

export async function removeCollaborator(
  db: D1Database,
  mapId: string,
  userId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM studio_collaborators WHERE map_id = ? AND user_id = ?')
    .bind(mapId, userId)
    .run();
}

export async function getTeamSession(
  db: D1Database,
  mapId: string
): Promise<TeamSession | null> {
  const row = await db
    .prepare('SELECT * FROM studio_collab_sessions WHERE map_id = ? LIMIT 1')
    .bind(mapId)
    .first<TeamSessionRow>();
  return row ? mapSession(row) : null;
}

/** Owner-only switch. Disabling keeps invites so a session can be resumed. */
export async function setTeamSession(
  db: D1Database,
  mapId: string,
  ownerId: string,
  enabled: boolean
): Promise<TeamSession> {
  const now = new Date().toISOString();
  const existing = await getTeamSession(db, mapId);
  await db
    .prepare(
      `INSERT INTO studio_collab_sessions (map_id, owner_id, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(map_id) DO UPDATE SET enabled = excluded.enabled,
         owner_id = excluded.owner_id, updated_at = excluded.updated_at`
    )
    .bind(mapId, ownerId, enabled ? 1 : 0, existing?.createdAt || now, now)
    .run();
  return {
    mapId,
    ownerId,
    enabled,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export async function isTeamEnabled(db: D1Database, mapId: string): Promise<boolean> {
  const session = await getTeamSession(db, mapId);
  return Boolean(session?.enabled);
}
