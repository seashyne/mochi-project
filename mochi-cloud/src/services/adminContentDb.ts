// Administrative game catalog moderation and audit log pagination queries

import { AdminGameStatus, recordAdminAuditLog } from './adminDb';

export interface RawAdminGameRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creator_id: string;
  creator_name?: string | null;
  creator_username?: string | null;
  thumbnail_url: string | null;
  status: AdminGameStatus;
  current_version_id: string | null;
  play_count?: number | null;
  is_featured?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminGame {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creatorId: string;
  creator_id: string;
  creatorName: string;
  creator_name: string;
  thumbnailUrl: string | null;
  thumbnail_url: string | null;
  status: AdminGameStatus;
  currentVersionId: string | null;
  current_version_id: string | null;
  playCount: number;
  play_count: number;
  isFeatured: boolean;
  is_featured: number;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
}

export interface RawAuditLogRow {
  id: string;
  admin_id: string;
  admin_username?: string | null;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  admin_id: string;
  adminUsername: string;
  admin_username: string;
  action: string;
  targetType: string;
  target_type: string;
  targetId: string;
  target_id: string;
  details: string;
  createdAt: string;
  created_at: string;
}

// Maps raw D1 game row to dual-case AdminGame moderation record
export function mapAdminGame(row: RawAdminGameRow): AdminGame {
  const creatorName = row.creator_name || row.creator_username || row.creator_id;
  const playCount = typeof row.play_count === 'number' ? row.play_count : 0;
  const featuredFlag = row.is_featured === 1 ? 1 : 0;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    creatorId: row.creator_id,
    creator_id: row.creator_id,
    creatorName,
    creator_name: creatorName,
    thumbnailUrl: row.thumbnail_url,
    thumbnail_url: row.thumbnail_url,
    status: row.status,
    currentVersionId: row.current_version_id,
    current_version_id: row.current_version_id,
    playCount,
    play_count: playCount,
    isFeatured: featuredFlag === 1,
    is_featured: featuredFlag,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

// Maps raw D1 audit log row to dual-case AdminAuditLog record
export function mapAdminAuditLog(row: RawAuditLogRow): AdminAuditLog {
  const adminUsername = row.admin_username || '';
  return {
    id: row.id,
    adminId: row.admin_id,
    admin_id: row.admin_id,
    adminUsername,
    admin_username: adminUsername,
    action: row.action,
    targetType: row.target_type,
    target_type: row.target_type,
    targetId: row.target_id,
    target_id: row.target_id,
    details: row.details || '{}',
    createdAt: row.created_at,
    created_at: row.created_at
  };
}

// Lists all game catalog submissions across statuses with optional search and status filters
export async function listAdminGames(
  db: D1Database,
  options: { query?: string; status?: string; page?: number; limit?: number }
): Promise<{ games: AdminGame[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const search = options.query?.trim().toLowerCase() || '';
  const statusFilter = options.status && options.status !== 'all' ? options.status.trim() : '';

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (statusFilter) {
    clauses.push('g.status = ?');
    params.push(statusFilter);
  }
  if (search) {
    clauses.push("(LOWER(g.title) LIKE ? OR LOWER(COALESCE(g.description, '')) LIKE ? OR LOWER(g.slug) LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const countRow = await db
    .prepare(`SELECT COUNT(*) as count FROM games g ${whereSql}`)
    .bind(...params)
    .first<{ count: number }>();
  const total = countRow?.count || 0;

  const rows = await db
    .prepare(
      `SELECT g.*, u.display_name as creator_name, u.username as creator_username
       FROM games g
       LEFT JOIN users u ON g.creator_id = u.id
       ${whereSql}
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<RawAdminGameRow>();

  return {
    games: (rows.results || []).map(mapAdminGame),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

// Updates a game's moderation status or featured flag and appends an immutable audit log
export async function moderateAdminGame(
  db: D1Database,
  gameId: string,
  updates: { status?: AdminGameStatus; isFeatured?: boolean },
  admin: { id: string; username: string }
): Promise<AdminGame | null> {
  const existing = await db
    .prepare(
      `SELECT g.*, u.display_name as creator_name, u.username as creator_username
       FROM games g
       LEFT JOIN users u ON g.creator_id = u.id
       WHERE g.id = ?
       LIMIT 1`
    )
    .bind(gameId)
    .first<RawAdminGameRow>();

  const targetRow = existing || (await db
    .prepare('SELECT * FROM games WHERE id = ? LIMIT 1')
    .bind(gameId)
    .first<RawAdminGameRow>());

  if (!targetRow) return null;

  const nextStatus = updates.status || targetRow.status;
  const nextIsFeatured = typeof updates.isFeatured === 'boolean'
    ? (updates.isFeatured ? 1 : 0)
    : (targetRow.is_featured === 1 ? 1 : 0);
  const updatedAt = new Date().toISOString();

  await db
    .prepare('UPDATE games SET status = ?, is_featured = ?, updated_at = ? WHERE id = ?')
    .bind(nextStatus, nextIsFeatured, updatedAt, gameId)
    .run();

  const auditDetails: Record<string, unknown> = {};
  if (updates.status) auditDetails.status = nextStatus;
  if (typeof updates.isFeatured === 'boolean') auditDetails.isFeatured = updates.isFeatured;

  await recordAdminAuditLog(db, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'MODERATE_GAME',
    targetType: 'game',
    targetId: gameId,
    details: auditDetails
  });

  return mapAdminGame({
    ...targetRow,
    status: nextStatus,
    is_featured: nextIsFeatured,
    updated_at: updatedAt
  });
}

// Lists immutable administrative audit logs ordered newest first
export async function listAdminAuditLogs(
  db: D1Database,
  options: { page?: number; limit?: number }
): Promise<{ logs: AdminAuditLog[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 50));
  const offset = (page - 1) * limit;

  const countRow = await db
    .prepare('SELECT COUNT(*) as count FROM audit_logs')
    .first<{ count: number }>();
  const total = countRow?.count || 0;

  const rows = await db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all<RawAuditLogRow>();

  return {
    logs: (rows.results || []).map(mapAdminAuditLog),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}
