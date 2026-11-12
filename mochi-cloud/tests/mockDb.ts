// In-memory D1 database and R2 mock for standalone unit testing without Cloudflare network

import {
  AdminMockAuditShape,
  handleAdminMockSelect,
  handleAdminMockMutation
} from './mockDbAdmin';
import {
  ShopMockCols,
  StoredWallet,
  StoredCoinLedger,
  StoredShopItem,
  StoredInventory,
  handleShopMockSelect,
  handleShopMockMutation
} from './mockDbShop';

export interface StoredUser {
  id: string;
  numeric_id?: number | null;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  coins?: number;
  is_banned?: number;
  created_at: string;
  updated_at: string;
  is_verified?: number;
  birthday?: string | null;
  gender?: string | null;
}

export interface StoredOtp {
  id: string;
  user_id: string;
  email: string;
  code: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

export interface StoredGame {
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

export interface StoredVersion {
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

export interface StoredAvatar {
  user_id: string; model_type: string; head_color: string; torso_color: string;
  left_arm_color: string; right_arm_color: string; left_leg_color: string; right_leg_color: string;
  hat_id: string | null; shirt_id: string | null; pants_id?: string | null;
  face_id?: string | null; hair_id?: string | null; back_id?: string | null; emote_ids?: string | null;
  updated_at: string;
}

function makeD1Result<T>(results: T[]): D1Result<T> {
  return {
    results,
    success: true,
    meta: { duration: 0, rows_read: results.length, rows_written: 0 } as unknown as D1Result<T>['meta']
  };
}

export function createMockDb(): D1Database {
  const users = new Map<string, StoredUser>();
  const otps = new Map<string, StoredOtp>();
  const games = new Map<string, StoredGame>();
  const versions = new Map<string, StoredVersion>();
  const avatars = new Map<string, StoredAvatar>();
  const auditLogs: AdminMockAuditShape[] = [];
  const adminCols = {
    users,
    games,
    auditLogs,
    versionLookup: (vid: string) => versions.get(vid)
  };
  const shopCols: ShopMockCols = {
    wallets: new Map<string, StoredWallet>(),
    ledger: [] as StoredCoinLedger[],
    shopItems: new Map<string, StoredShopItem>(),
    inventory: new Map<string, StoredInventory>()
  };

  return {
    prepare(query: string) {
      let boundParams: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          boundParams = params;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const res = await stmt.all<T>();
          return res.results && res.results.length > 0 ? res.results[0] : null;
        },
        async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          const q = query.trim();

          if (q.includes('COALESCE(MAX(numeric_id), 0)')) {
            let maxId = 0;
            for (const u of users.values()) if (u.numeric_id && u.numeric_id > maxId) maxId = u.numeric_id;
            return makeD1Result<T>([{ max_id: maxId }] as unknown as T[]);
          }

          if (q.includes('FROM email_verification_otps WHERE email = ?')) {
            const email = String(boundParams[0]).toLowerCase();
            const list = Array.from(otps.values())
              .filter((o) => o.email.toLowerCase() === email)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return makeD1Result<T>(list as unknown as T[]);
          }

          if (q.includes('FROM users WHERE email = ?')) {
            const email = String(boundParams[0]).toLowerCase();
            const u = Array.from(users.values()).find((x) => x.email === email);
            return makeD1Result<T>((u ? [u] : []) as T[]);
          }
          if (q.includes('FROM users WHERE username = ?')) {
            const username = String(boundParams[0]).toLowerCase();
            const u = Array.from(users.values()).find((x) => x.username === username);
            return makeD1Result<T>((u ? [u] : []) as T[]);
          }
          if (q.includes('FROM users WHERE numeric_id = ?')) {
            const num = Number(boundParams[0]);
            const u = Array.from(users.values()).find((x) => x.numeric_id === num);
            return makeD1Result<T>((u ? [u] : []) as T[]);
          }
          if (q.includes('FROM users WHERE id = ?')) {
            const u = users.get(String(boundParams[0]));
            return makeD1Result<T>((u ? [u] : []) as T[]);
          }

          if (q.includes('FROM games g') && q.includes('WHERE g.id = ? OR g.slug = ?')) {
            const key = String(boundParams[0]);
            const g = Array.from(games.values()).find((x) => x.id === key || x.slug === key);
            if (!g) return makeD1Result<T>([]);
            const creator = users.get(g.creator_id);
            const ver = g.current_version_id ? versions.get(g.current_version_id) : undefined;
            return makeD1Result<T>([{ ...g, creator_name: creator?.display_name || creator?.username, current_version: ver?.version_number }] as unknown as T[]);
          }

          const adminSelected = handleAdminMockSelect(q, boundParams, adminCols);
          if (adminSelected !== null) {
            return makeD1Result<T>(adminSelected as T[]);
          }

          const shopSelected = handleShopMockSelect<T>(q, boundParams, shopCols);
          if (shopSelected !== null) {
            return makeD1Result<T>(shopSelected);
          }

          if (q.includes('FROM game_versions WHERE game_id = ?')) {
            const list = Array.from(versions.values()).filter((v) => v.game_id === String(boundParams[0]));
            return makeD1Result<T>(list as unknown as T[]);
          }

          if (q.includes('FROM user_avatars WHERE user_id = ?')) {
            const a = avatars.get(String(boundParams[0]));
            return makeD1Result<T>((a ? [a] : []) as T[]);
          }

          return makeD1Result<T>([]);
        },
        async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          const q = query.trim();

          if (handleAdminMockMutation(q, boundParams, adminCols) || handleShopMockMutation(q, boundParams, shopCols)) {
            return makeD1Result<T>([]);
          }

          if (q.startsWith('INSERT INTO email_verification_otps')) {
            const [id, user_id, email, code, expires_at, attempts, created_at] = boundParams as [string, string, string, string, string, number, string];
            otps.set(id, { id, user_id, email: email.toLowerCase(), code, expires_at, attempts: attempts || 0, created_at });
          } else if (q.includes('UPDATE email_verification_otps SET code = ? WHERE user_id = ?')) {
            const [code, userId] = boundParams as [string, string];
            for (const o of otps.values()) if (o.user_id === userId) o.code = code;
          } else if (q.includes('UPDATE email_verification_otps SET created_at = ? WHERE email = ?')) {
            const [createdAt, email] = boundParams as [string, string];
            for (const o of otps.values()) if (o.email.toLowerCase() === email.toLowerCase()) o.created_at = createdAt;
          } else if (q.startsWith('UPDATE email_verification_otps SET attempts = attempts + 1')) {
            const otp = otps.get(String(boundParams[0]));
            if (otp) otp.attempts += 1;
          } else if (q.startsWith('DELETE FROM email_verification_otps WHERE user_id = ? OR email = ?')) {
            const [userId, email] = boundParams as [string, string];
            const clean = email.toLowerCase();
            for (const [k, v] of otps.entries()) if (v.user_id === userId || v.email.toLowerCase() === clean) otps.delete(k);
          } else if (q.startsWith('DELETE FROM email_verification_otps WHERE id = ?')) {
            otps.delete(String(boundParams[0]));
          } else if (q.startsWith('UPDATE users SET is_verified = 1')) {
            if (q.includes('WHERE id = ?')) {
              const [updatedAt, id] = boundParams as [string, string];
              const u = users.get(id);
              if (u) { u.is_verified = 1; u.updated_at = updatedAt; }
            } else {
              for (const u of users.values()) u.is_verified = 1;
            }
          } else if (q.startsWith('UPDATE users SET email = ?')) {
            const [newEmail, isVerified, updatedAt, id] = boundParams as [string, number, string, string];
            const u = users.get(id);
            if (u) { u.email = newEmail; u.is_verified = isVerified; u.updated_at = updatedAt; }
          } else if (q.startsWith('UPDATE users SET display_name = ?')) {
            const [displayName, updatedAt, id] = boundParams as [string, string, string];
            const u = users.get(id);
            if (u) { u.display_name = displayName; u.updated_at = updatedAt; }
          } else if (q.startsWith('UPDATE users SET password_hash = ?')) {
            const [passwordHash, updatedAt, id] = boundParams as [string, string, string];
            const u = users.get(id);
            if (u) { u.password_hash = passwordHash; u.updated_at = updatedAt; }
          } else if (q.startsWith('INSERT INTO users')) {
            const [id, numeric_id, username, email, password_hash, display_name, role] = boundParams as [string, number, string, string, string, string, string];
            const is11 = boundParams.length === 11;
            const bDay = is11 ? (boundParams[7] as string | null) : null;
            const gdr = is11 ? (boundParams[8] as string | null) : null;
            const cAt = String(is11 ? boundParams[9] : boundParams[7]);
            const uAt = String(is11 ? boundParams[10] : boundParams[8]);
            const isVer = !is11 && boundParams[9] !== undefined ? Number(boundParams[9]) : 0;
            users.set(id, {
              id, numeric_id, username, email, password_hash, display_name, role,
              birthday: bDay, gender: gdr, coins: 100, is_banned: 0,
              created_at: cAt, updated_at: uAt, is_verified: isVer
            });
          } else if (q.startsWith('INSERT INTO games')) {
            const [id, slug, title, description, creator_id, thumbnail_url, status, current_version_id, play_count, created_at, updated_at] = boundParams as [string, string, string, string | null, string, string | null, StoredGame['status'], string | null, number, string, string];
            games.set(id, { id, slug, title, description, creator_id, thumbnail_url, status, current_version_id, play_count, is_featured: 0, created_at, updated_at });
          } else if (q.startsWith('INSERT INTO game_versions')) {
            const [id, game_id, version_number, changelog, bundle_url, manifest_json, status, published_at, created_at] = boundParams as [string, string, string, string | null, string, string, 'draft' | 'published' | 'deprecated', string, string];
            versions.set(id, { id, game_id, version_number, changelog, bundle_url, manifest_json, status, published_at, created_at });
          } else if (q.startsWith('UPDATE games SET current_version_id = ?')) {
            const [versionId, updatedAt, gameId] = boundParams as [string, string, string];
            const g = games.get(gameId);
            if (g) { g.current_version_id = versionId; g.status = 'published'; g.updated_at = updatedAt; }
          } else if (q.includes('INTO user_avatars')) {
            const uid = String(boundParams[0]);
            if (!avatars.has(uid)) {
              avatars.set(uid, {
                user_id: uid, model_type: String(boundParams[1]), head_color: String(boundParams[2]),
                torso_color: String(boundParams[3]), left_arm_color: String(boundParams[4]),
                right_arm_color: String(boundParams[5]), left_leg_color: String(boundParams[6]),
                right_leg_color: String(boundParams[7]), hat_id: (boundParams[8] as string) || null,
                shirt_id: (boundParams[9] as string) || null, pants_id: (boundParams[10] as string) || null,
                face_id: (boundParams[11] as string) || null, hair_id: (boundParams[12] as string) || null,
                back_id: (boundParams[13] as string) || null, emote_ids: (boundParams[14] as string) || null,
                updated_at: String(boundParams[boundParams.length - 1])
              });
            }
          } else if (q.startsWith('UPDATE user_avatars')) {
            const uid = String(boundParams[boundParams.length - 1]);
            avatars.set(uid, {
              user_id: uid, model_type: String(boundParams[0]), head_color: String(boundParams[1]),
              torso_color: String(boundParams[2]), left_arm_color: String(boundParams[3]),
              right_arm_color: String(boundParams[4]), left_leg_color: String(boundParams[5]),
              right_leg_color: String(boundParams[6]), hat_id: (boundParams[7] as string) || null,
              shirt_id: (boundParams[8] as string) || null, pants_id: (boundParams[9] as string) || null,
              face_id: (boundParams[10] as string) || null, hair_id: (boundParams[11] as string) || null,
              back_id: (boundParams[12] as string) || null, emote_ids: (boundParams[13] as string) || null,
              updated_at: String(boundParams[boundParams.length - 2])
            });
          }

          return makeD1Result<T>([]);
        }
      };
      return stmt as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}
