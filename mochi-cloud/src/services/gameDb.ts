import { Game, GameVersion, GameSession } from '../types/api';

export interface GameRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creator_id: string;
  thumbnail_url: string | null;
  status: 'draft' | 'published' | 'rejected' | 'archived';
  current_version_id: string | null;
  play_count: number;
  is_featured?: number | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  current_version?: string;
}

export interface GameVersionRow {
  id: string;
  game_id: string;
  version_number: string;
  changelog: string | null;
  bundle_url: string;
  manifest_json: string;
  status: 'draft' | 'published' | 'deprecated';
  published_at: string;
  created_at: string;
}

export function mapGameRow(row: GameRow): Game {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    creatorId: row.creator_id,
    thumbnailUrl: row.thumbnail_url,
    status: row.status,
    currentVersionId: row.current_version_id,
    playCount: row.play_count,
    isFeatured: row.is_featured === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creatorName: row.creator_name,
    currentVersion: row.current_version
  };
}

export function mapVersionRow(row: GameVersionRow): GameVersion {
  return {
    id: row.id,
    gameId: row.game_id,
    versionNumber: row.version_number,
    changelog: row.changelog,
    bundleUrl: row.bundle_url,
    manifestJson: row.manifest_json,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at
  };
}

export async function listGames(
  db: D1Database,
  options: { page?: number; limit?: number; status?: string; search?: string; creatorId?: string } = {}
): Promise<{ games: Game[]; total: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  let whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    whereClauses.push('g.status = ?');
    params.push(options.status);
  } else {
    whereClauses.push("g.status = 'published'");
  }

  if (options.creatorId) {
    whereClauses.push('g.creator_id = ?');
    params.push(options.creatorId);
  }

  if (options.search) {
    whereClauses.push('(g.title LIKE ? OR g.description LIKE ?)');
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const countQuery = `SELECT COUNT(*) as count FROM games g ${whereSql}`;
  const countRow = await db.prepare(countQuery).bind(...params).first<{ count: number }>();
  const total = countRow?.count || 0;

  const selectQuery = `
    SELECT g.*, u.display_name as creator_name, v.version_number as current_version
    FROM games g
    LEFT JOIN users u ON g.creator_id = u.id
    LEFT JOIN game_versions v ON g.current_version_id = v.id
    ${whereSql}
    ORDER BY g.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(selectQuery)
    .bind(...params, limit, offset)
    .all<GameRow>();

  return {
    games: (rows.results || []).map(mapGameRow),
    total
  };
}

export async function findGameByIdOrSlug(db: D1Database, idOrSlug: string): Promise<Game | null> {
  const query = `
    SELECT g.*, u.display_name as creator_name, v.version_number as current_version
    FROM games g
    LEFT JOIN users u ON g.creator_id = u.id
    LEFT JOIN game_versions v ON g.current_version_id = v.id
    WHERE g.id = ? OR g.slug = ?
    LIMIT 1
  `;
  const row = await db.prepare(query).bind(idOrSlug, idOrSlug).first<GameRow>();
  return row ? mapGameRow(row) : null;
}

export async function createGame(db: D1Database, game: Game): Promise<Game> {
  await db
    .prepare(
      `INSERT INTO games (id, slug, title, description, creator_id, thumbnail_url, status, current_version_id, play_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      game.id,
      game.slug,
      game.title,
      game.description,
      game.creatorId,
      game.thumbnailUrl,
      game.status,
      game.currentVersionId,
      game.playCount,
      game.createdAt,
      game.updatedAt
    )
    .run();
  return game;
}

export async function createGameVersion(
  db: D1Database,
  version: GameVersion
): Promise<GameVersion> {
  await db
    .prepare(
      `INSERT INTO game_versions (id, game_id, version_number, changelog, bundle_url, manifest_json, status, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      version.id,
      version.gameId,
      version.versionNumber,
      version.changelog,
      version.bundleUrl,
      version.manifestJson,
      version.status,
      version.publishedAt,
      version.createdAt
    )
    .run();

  await db
    .prepare(
      `UPDATE games SET current_version_id = ?, status = 'published', updated_at = ? WHERE id = ?`
    )
    .bind(version.id, version.publishedAt, version.gameId)
    .run();

  return version;
}

export async function listGameVersionsByGameId(
  db: D1Database,
  gameId: string
): Promise<GameVersion[]> {
  const rows = await db
    .prepare('SELECT * FROM game_versions WHERE game_id = ? ORDER BY published_at DESC')
    .bind(gameId)
    .all<GameVersionRow>();
  return (rows.results || []).map(mapVersionRow);
}

export async function recordGameSession(
  db: D1Database,
  session: GameSession
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO game_sessions (id, game_id, user_id, session_token, ip_hash, started_at, ended_at, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      session.id,
      session.gameId,
      session.userId,
      session.sessionToken,
      session.ipHash,
      session.startedAt,
      session.endedAt,
      session.durationSeconds
    )
    .run();

  await db
    .prepare('UPDATE games SET play_count = play_count + 1 WHERE id = ?')
    .bind(session.gameId)
    .run();
}
