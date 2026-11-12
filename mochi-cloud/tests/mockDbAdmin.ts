// Shared in-memory SQL query evaluator for Admin Backoffice, catalog filtering, and audit logs

export interface AdminMockUserShape {
  id: string;
  numeric_id?: number | null;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  coins?: number;
  is_banned?: number;
  is_verified?: number;
  created_at: string;
  updated_at: string;
}

export interface AdminMockGameShape {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creator_id: string;
  thumbnail_url: string | null;
  status: 'draft' | 'published' | 'rejected' | 'archived';
  current_version_id: string | null;
  play_count: number;
  is_featured?: number;
  created_at: string;
  updated_at: string;
}

export interface AdminMockAuditShape {
  id: string;
  admin_id: string;
  admin_username?: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface AdminMockCollections<
  U extends AdminMockUserShape = AdminMockUserShape,
  G extends AdminMockGameShape = AdminMockGameShape
> {
  users: Map<string, U>;
  games: Map<string, G>;
  auditLogs: AdminMockAuditShape[];
  versionLookup?: (versionId: string) => { version_number: string } | undefined;
}

// Filters and paginates game records matching gameDb.ts and adminContentDb.ts SQL clauses
function evaluateGameList<U extends AdminMockUserShape, G extends AdminMockGameShape>(
  q: string,
  boundParams: unknown[],
  cols: AdminMockCollections<U, G>,
  applySlice: boolean
): unknown[] {
  let idx = 0;
  let list = Array.from(cols.games.values());

  if (q.includes('g.status = ?')) {
    const status = String(boundParams[idx++]);
    list = list.filter((g) => g.status === status);
  } else if (q.includes("g.status = 'published'")) {
    list = list.filter((g) => g.status === 'published');
  }

  if (q.includes('g.creator_id = ?')) {
    const creatorId = String(boundParams[idx++]);
    list = list.filter((g) => g.creator_id === creatorId);
  }

  if (q.includes('g.slug) LIKE ?')) {
    const needle = String(boundParams[idx]).replace(/^%|%$/g, '').toLowerCase();
    idx += 3;
    list = list.filter(
      (g) =>
        g.title.toLowerCase().includes(needle) ||
        (g.description || '').toLowerCase().includes(needle) ||
        g.slug.toLowerCase().includes(needle)
    );
  } else if (q.includes('g.title LIKE ?')) {
    const needle = String(boundParams[idx]).replace(/^%|%$/g, '').toLowerCase();
    idx += 2;
    list = list.filter(
      (g) =>
        g.title.toLowerCase().includes(needle) ||
        (g.description || '').toLowerCase().includes(needle)
    );
  }

  list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (applySlice && q.includes('LIMIT ? OFFSET ?')) {
    const limit = Number(boundParams[idx++]);
    const offset = Number(boundParams[idx++]);
    list = list.slice(offset, offset + limit);
  }

  return list.map((g) => {
    const creator = cols.users.get(g.creator_id);
    const ver = g.current_version_id && cols.versionLookup ? cols.versionLookup(g.current_version_id) : undefined;
    return {
      ...g,
      is_featured: g.is_featured ?? 0,
      creator_name: creator?.display_name || creator?.username,
      creator_username: creator?.username,
      current_version: ver?.version_number
    };
  });
}

// Evaluates SELECT queries for admin stats, users, games, and audit logs; returns null if unmatched
export function handleAdminMockSelect<U extends AdminMockUserShape, G extends AdminMockGameShape>(
  q: string,
  boundParams: unknown[],
  cols: AdminMockCollections<U, G>
): unknown[] | null {
  if (q.includes('COUNT(*) as count FROM users')) {
    if (q.includes('LIKE ?')) {
      const needle = String(boundParams[0]).replace(/^%|%$/g, '').toLowerCase();
      const matched = Array.from(cols.users.values()).filter(
        (u) =>
          u.username.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          (u.display_name || '').toLowerCase().includes(needle)
      );
      return [{ count: matched.length }];
    }
    return [{ count: cols.users.size }];
  }

  if (q.includes('FROM users') && q.includes('ORDER BY created_at DESC LIMIT ? OFFSET ?')) {
    let list = Array.from(cols.users.values());
    if (q.includes('LIKE ?')) {
      const needle = String(boundParams[0]).replace(/^%|%$/g, '').toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          (u.display_name || '').toLowerCase().includes(needle)
      );
    }
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const limit = Number(boundParams[boundParams.length - 2]);
    const offset = Number(boundParams[boundParams.length - 1]);
    return list.slice(offset, offset + limit);
  }

  if (q.includes('FROM game_sessions')) {
    return [{ count: 0 }];
  }

  if (q.includes('COUNT(*) as count FROM audit_logs')) {
    return [{ count: cols.auditLogs.length }];
  }

  if (q.includes('FROM audit_logs ORDER BY created_at DESC')) {
    const ordered = [...cols.auditLogs]
      .reverse()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const limit = Number(boundParams[0] ?? 50);
    const offset = Number(boundParams[1] ?? 0);
    return ordered.slice(offset, offset + limit);
  }

  if (q.includes('COUNT(*) as count FROM games')) {
    if (q.includes('FROM games g')) {
      const filtered = evaluateGameList(q, boundParams, cols, false);
      return [{ count: filtered.length }];
    }
    return [{ count: cols.games.size }];
  }

  if (q.includes('FROM games g') && q.includes('WHERE g.id = ?') && !q.includes('OR g.slug = ?')) {
    const g = cols.games.get(String(boundParams[0]));
    if (!g) return [];
    const creator = cols.users.get(g.creator_id);
    return [{ ...g, creator_name: creator?.display_name || creator?.username, creator_username: creator?.username }];
  }

  if (q.includes('FROM games WHERE id = ?')) {
    const g = cols.games.get(String(boundParams[0]));
    return g ? [g] : [];
  }

  if (q.includes('FROM games g') && !q.includes('WHERE g.id = ? OR g.slug = ?')) {
    return evaluateGameList(q, boundParams, cols, true);
  }

  return null;
}

// Evaluates INSERT/UPDATE mutations for admin user actions, game moderation, and audit logging
export function handleAdminMockMutation<U extends AdminMockUserShape, G extends AdminMockGameShape>(
  q: string,
  boundParams: unknown[],
  cols: AdminMockCollections<U, G>
): boolean {
  if (q.startsWith('UPDATE users SET coins = ?, is_banned = ?, role = ?, updated_at = ? WHERE id = ?')) {
    const [coins, isBanned, role, updatedAt, id] = boundParams as [number, number, string, string, string];
    const u = cols.users.get(id);
    if (u) {
      u.coins = Number(coins);
      u.is_banned = Number(isBanned);
      u.role = role;
      u.updated_at = updatedAt;
    }
    return true;
  }

  if (q.startsWith('UPDATE users SET role = ? WHERE id = ?')) {
    const [role, id] = boundParams as [string, string];
    const u = cols.users.get(id);
    if (u) u.role = role;
    return true;
  }

  if (q.startsWith('UPDATE users SET is_banned = ? WHERE id = ?')) {
    const [banned, id] = boundParams as [number, string];
    const u = cols.users.get(id);
    if (u) u.is_banned = Number(banned);
    return true;
  }

  if (q.startsWith('UPDATE games SET status = ?, is_featured = ?, updated_at = ? WHERE id = ?')) {
    const [status, isFeatured, updatedAt, id] = boundParams as [G['status'], number, string, string];
    const g = cols.games.get(id);
    if (g) {
      g.status = status;
      g.is_featured = Number(isFeatured);
      g.updated_at = updatedAt;
    }
    return true;
  }

  if (q.startsWith('INSERT INTO audit_logs')) {
    const [id, admin_id, admin_username, action, target_type, target_id, details, created_at] = boundParams as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ];
    cols.auditLogs.push({ id, admin_id, admin_username, action, target_type, target_id, details, created_at });
    return true;
  }

  return false;
}
