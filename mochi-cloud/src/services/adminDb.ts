// Administrative Backoffice user management, platform telemetry, and audit helper queries

export type AdminUserRole = 'player' | 'creator' | 'admin';
export type AdminGameStatus = 'draft' | 'published' | 'rejected' | 'archived';

export interface AdminStats {
  activeOnlineUsers: number;
  totalGameplaySessions: number;
  totalGames: number;
  totalRegisteredUsers: number;
}

interface RawAdminUserRow {
  id: string;
  numeric_id?: number | null;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  coins?: number | null;
  is_banned?: number | null;
  is_verified?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  numericId: number;
  numeric_id: number;
  username: string;
  email: string;
  displayName: string | null;
  display_name: string | null;
  role: string;
  coins: number;
  isBanned: boolean;
  is_banned: number;
  isVerified: boolean;
  is_verified: number;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
}

// Maps raw D1 user row to dual-case AdminUser payload while omitting password hashes
export function mapAdminUser(row: RawAdminUserRow): AdminUser {
  const numericId = row.numeric_id || 1;
  const coins = typeof row.coins === 'number' ? row.coins : 100;
  const isBannedFlag = row.is_banned === 1 ? 1 : 0;
  const isVerifiedFlag = row.is_verified === 1 ? 1 : 0;
  return {
    id: row.id,
    numericId,
    numeric_id: numericId,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    display_name: row.display_name,
    role: row.role || 'player',
    coins,
    isBanned: isBannedFlag === 1,
    is_banned: isBannedFlag,
    isVerified: isVerifiedFlag === 1,
    is_verified: isVerifiedFlag,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

// Appends an immutable administrative audit trail record to D1
export async function recordAdminAuditLog(
  db: D1Database,
  entry: {
    adminId: string;
    adminUsername: string;
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, admin_id, admin_username, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      entry.adminId,
      entry.adminUsername,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.details),
      new Date().toISOString()
    )
    .run();
}

// Aggregates real-time platform KPIs for the Admin Backoffice dashboard
export async function getAdminStats(db: D1Database): Promise<AdminStats> {
  const usersRow = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const gamesRow = await db.prepare('SELECT COUNT(*) as count FROM games').first<{ count: number }>();
  const sessionsRow = await db
    .prepare('SELECT COUNT(*) as count FROM game_sessions')
    .first<{ count: number }>()
    .catch(() => ({ count: 0 }));
  const activeRow = await db
    .prepare('SELECT COUNT(DISTINCT user_id) as count FROM game_sessions WHERE ended_at IS NULL AND user_id IS NOT NULL')
    .first<{ count: number }>()
    .catch(() => ({ count: 0 }));

  return {
    activeOnlineUsers: Math.max(1, activeRow?.count || 0),
    totalGameplaySessions: sessionsRow?.count || 0,
    totalGames: gamesRow?.count || 0,
    totalRegisteredUsers: usersRow?.count || 0
  };
}

// Lists and searches registered accounts with pagination
export async function listAdminUsers(
  db: D1Database,
  options: { query?: string; page?: number; limit?: number }
): Promise<{ users: AdminUser[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const search = options.query?.trim().toLowerCase() || '';

  const whereSql = search
    ? "WHERE LOWER(username) LIKE ? OR LOWER(email) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ?"
    : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const countRow = await db
    .prepare(`SELECT COUNT(*) as count FROM users ${whereSql}`)
    .bind(...searchParams)
    .first<{ count: number }>();
  const total = countRow?.count || 0;

  const rows = await db
    .prepare(`SELECT * FROM users ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...searchParams, limit, offset)
    .all<RawAdminUserRow>();

  return {
    users: (rows.results || []).map(mapAdminUser),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

// Updates a user's coin balance, suspension status, or RBAC role and records an audit entry
export async function updateAdminUser(
  db: D1Database,
  userId: string,
  updates: { isBanned?: boolean; coins?: number; role?: AdminUserRole },
  admin: { id: string; username: string }
): Promise<AdminUser | null> {
  const existing = await db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(userId)
    .first<RawAdminUserRow>();
  if (!existing) return null;

  const nextCoins = typeof updates.coins === 'number'
    ? Math.max(0, Math.floor(updates.coins))
    : (typeof existing.coins === 'number' ? existing.coins : 100);
  const nextIsBanned = typeof updates.isBanned === 'boolean'
    ? (updates.isBanned ? 1 : 0)
    : (existing.is_banned === 1 ? 1 : 0);
  const nextRole = updates.role || existing.role || 'player';
  const updatedAt = new Date().toISOString();

  await db
    .prepare('UPDATE users SET coins = ?, is_banned = ?, role = ?, updated_at = ? WHERE id = ?')
    .bind(nextCoins, nextIsBanned, nextRole, updatedAt, userId)
    .run();

  const auditDetails: Record<string, unknown> = {};
  if (typeof updates.isBanned === 'boolean') auditDetails.isBanned = updates.isBanned;
  if (typeof updates.coins === 'number') auditDetails.coins = nextCoins;
  if (updates.role) auditDetails.role = nextRole;

  await recordAdminAuditLog(db, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'UPDATE_USER',
    targetType: 'user',
    targetId: userId,
    details: auditDetails
  });

  return mapAdminUser({ ...existing, coins: nextCoins, is_banned: nextIsBanned, role: nextRole, updated_at: updatedAt });
}

export * from './adminContentDb';
