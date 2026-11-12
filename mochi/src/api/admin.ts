// Typed Admin Backoffice API Client, Payload Normalizers, and RBAC Helpers

import { ApiClient, defaultApiClient } from './client';
import { getStoredToken } from './auth';
import {
  AdminAuditLogItem,
  AdminGameItem,
  AdminPlatformStats,
  AdminUserItem,
  UserProfile
} from './types';

// Evaluates whether a user session holds active, non-suspended administrator privileges
export function canAccessAdminPortal(
  user: Pick<UserProfile, 'role' | 'isBanned'> | null | undefined
): boolean {
  return Boolean(user && user.role === 'admin' && !user.isBanned);
}

// Determines whether a browser pathname targets the /admin backoffice route
export function isAdminPathname(pathname: string): boolean {
  const clean = pathname.trim();
  return clean === '/admin' || clean.startsWith('/admin/');
}

// Safely coerces numeric JSON or SQLite values into finite numbers
function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Safely coerces boolean or SQLite integer flags (0/1) into strict booleans
function toStrictBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Normalizes platform telemetry counters across snake_case and camelCase backend schemas
export function normalizePlatformStats(rawInput: unknown): AdminPlatformStats {
  const root = asRecord(rawInput);
  const src = root.stats ? asRecord(root.stats) : root;
  return {
    activeOnlineUsers: toFiniteNumber(
      src.activeOnlineUsers ?? src.active_online_users ?? src.onlineUsers ?? src.online_users
    ),
    totalGameplaySessions: toFiniteNumber(
      src.totalGameplaySessions ??
        src.total_gameplay_sessions ??
        src.totalPlays ??
        src.total_plays
    ),
    totalGames: toFiniteNumber(src.totalGames ?? src.total_games),
    totalRegisteredUsers: toFiniteNumber(
      src.totalRegisteredUsers ??
        src.total_registered_users ??
        src.totalUsers ??
        src.total_users
    )
  };
}

// Normalizes administrative user records across snake_case D1 columns and camelCase DTOs
export function normalizeAdminUser(rawInput: unknown): AdminUserItem {
  const u = asRecord(rawInput);
  const rawRole = String(u.role ?? 'player');
  const role: AdminUserItem['role'] =
    rawRole === 'admin' || rawRole === 'creator' ? rawRole : 'player';
  const rawDisplay = u.displayName ?? u.display_name;

  return {
    id: String(u.id ?? ''),
    numericId: toFiniteNumber(u.numericId ?? u.numeric_id),
    username: String(u.username ?? ''),
    email: String(u.email ?? ''),
    displayName: typeof rawDisplay === 'string' ? rawDisplay : null,
    role,
    coins: toFiniteNumber(u.coins ?? u.coin_balance),
    isBanned: toStrictBoolean(u.isBanned ?? u.is_banned),
    isVerified: toStrictBoolean(u.isVerified ?? u.is_verified),
    createdAt: String(u.createdAt ?? u.created_at ?? '')
  };
}

// Normalizes administrative game moderation records across snake_case and camelCase fields
export function normalizeAdminGame(rawInput: unknown): AdminGameItem {
  const g = asRecord(rawInput);
  const rawStatus = String(g.status ?? 'draft');
  const status: AdminGameItem['status'] =
    rawStatus === 'published' || rawStatus === 'archived' || rawStatus === 'rejected'
      ? rawStatus
      : 'draft';
  const rawCreator =
    g.creatorName ?? g.creator_name ?? g.creatorUsername ?? g.creator_username;

  return {
    id: String(g.id ?? ''),
    slug: String(g.slug ?? ''),
    title: String(g.title ?? ''),
    description: typeof g.description === 'string' ? g.description : null,
    creatorId: String(g.creatorId ?? g.creator_id ?? ''),
    creatorName: typeof rawCreator === 'string' ? rawCreator : undefined,
    status,
    isFeatured: toStrictBoolean(g.isFeatured ?? g.is_featured),
    playCount: toFiniteNumber(g.playCount ?? g.play_count),
    createdAt: String(g.createdAt ?? g.created_at ?? ''),
    updatedAt: String(g.updatedAt ?? g.updated_at ?? '')
  };
}

// Normalizes immutable administrative audit log entries
export function normalizeAdminAuditLog(rawInput: unknown): AdminAuditLogItem {
  const item = asRecord(rawInput);
  const rawAdminName = item.adminUsername ?? item.admin_username;
  const rawDetails = item.details;
  const details =
    typeof rawDetails === 'string'
      ? rawDetails
      : rawDetails !== null && rawDetails !== undefined
        ? JSON.stringify(rawDetails)
        : '';

  return {
    id: String(item.id ?? ''),
    adminId: String(item.adminId ?? item.admin_id ?? ''),
    adminUsername: typeof rawAdminName === 'string' ? rawAdminName : undefined,
    action: String(item.action ?? ''),
    targetType: String(item.targetType ?? item.target_type ?? ''),
    targetId: String(item.targetId ?? item.target_id ?? ''),
    details,
    createdAt: String(item.createdAt ?? item.created_at ?? '')
  };
}

function buildQueryEndpoint(basePath: string, entries: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(entries)) {
    if (val && val.trim().length > 0) params.set(key, val.trim());
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export class AdminApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  // Attaches bearer token from stored session when client instance has no active token
  private buildAuthHeaders(): Record<string, string> {
    if (this.client.getToken()) return {};
    const stored = getStoredToken();
    return stored ? { Authorization: `Bearer ${stored}` } : {};
  }

  public async getStats(): Promise<{ ok: boolean; stats: AdminPlatformStats }> {
    const raw = await this.client.get<unknown>('/api/v1/admin/stats', {
      headers: this.buildAuthHeaders()
    });
    const record = asRecord(raw);
    return {
      ok: typeof record.ok === 'boolean' ? record.ok : true,
      stats: normalizePlatformStats(record)
    };
  }

  public async listUsers(params?: {
    query?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    ok: boolean;
    users: AdminUserItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const endpoint = buildQueryEndpoint('/api/v1/admin/users', {
      query: params?.query,
      page: params?.page ? String(params.page) : undefined,
      limit: params?.limit ? String(params.limit) : undefined
    });
    const record = asRecord(
      await this.client.get<unknown>(endpoint, { headers: this.buildAuthHeaders() })
    );
    const users = (Array.isArray(record.users) ? record.users : []).map(normalizeAdminUser);
    const limit = toFiniteNumber(record.limit ?? params?.limit, 20) || 20;
    const total = toFiniteNumber(record.total, users.length);
    const page = toFiniteNumber(record.page ?? params?.page, 1);
    const totalPages = toFiniteNumber(
      record.totalPages ?? record.total_pages,
      Math.max(1, Math.ceil(total / limit))
    );
    return { ok: typeof record.ok === 'boolean' ? record.ok : true, users, total, page, totalPages };
  }

  public async updateUser(
    id: string,
    updates: { isBanned?: boolean; coins?: number; role?: 'player' | 'creator' | 'admin' }
  ): Promise<{ ok: boolean; user: AdminUserItem }> {
    const endpoint = `/api/v1/admin/users/${encodeURIComponent(id)}`;
    const record = asRecord(
      await this.client.request<unknown>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: this.buildAuthHeaders()
      })
    );
    return {
      ok: typeof record.ok === 'boolean' ? record.ok : true,
      user: normalizeAdminUser(record.user ?? record)
    };
  }

  public async listGames(params?: {
    query?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    ok: boolean;
    games: AdminGameItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const endpoint = buildQueryEndpoint('/api/v1/admin/games', {
      query: params?.query,
      status: params?.status && params.status !== 'all' ? params.status : undefined,
      page: params?.page ? String(params.page) : undefined,
      limit: params?.limit ? String(params.limit) : undefined
    });
    const record = asRecord(
      await this.client.get<unknown>(endpoint, { headers: this.buildAuthHeaders() })
    );
    const games = (Array.isArray(record.games) ? record.games : []).map(normalizeAdminGame);
    const limit = toFiniteNumber(record.limit ?? params?.limit, 20) || 20;
    const total = toFiniteNumber(record.total, games.length);
    const page = toFiniteNumber(record.page ?? params?.page, 1);
    const totalPages = toFiniteNumber(
      record.totalPages ?? record.total_pages,
      Math.max(1, Math.ceil(total / limit))
    );
    return { ok: typeof record.ok === 'boolean' ? record.ok : true, games, total, page, totalPages };
  }

  public async moderateGame(
    id: string,
    updates: { status?: 'draft' | 'published' | 'rejected' | 'archived'; isFeatured?: boolean }
  ): Promise<{ ok: boolean; game: AdminGameItem }> {
    const endpoint = `/api/v1/admin/games/${encodeURIComponent(id)}`;
    const record = asRecord(
      await this.client.request<unknown>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: this.buildAuthHeaders()
      })
    );
    return {
      ok: typeof record.ok === 'boolean' ? record.ok : true,
      game: normalizeAdminGame(record.game ?? record)
    };
  }

  public async listAuditLogs(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ ok: boolean; logs: AdminAuditLogItem[]; total: number }> {
    const endpoint = buildQueryEndpoint('/api/v1/admin/audit-logs', {
      page: params?.page ? String(params.page) : undefined,
      limit: params?.limit ? String(params.limit) : undefined
    });
    const record = asRecord(
      await this.client.get<unknown>(endpoint, { headers: this.buildAuthHeaders() })
    );
    const rawList = record.logs ?? record.auditLogs ?? record.audit_logs;
    const logs = (Array.isArray(rawList) ? rawList : []).map(normalizeAdminAuditLog);
    return {
      ok: typeof record.ok === 'boolean' ? record.ok : true,
      logs,
      total: toFiniteNumber(record.total, logs.length)
    };
  }
}

export const adminApi = new AdminApi();
