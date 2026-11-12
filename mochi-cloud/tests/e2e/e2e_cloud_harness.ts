// E2E Cloud Test Harness for Mochi Platform Production Requirements
// Provides mock D1 database, transactional email recorder, and live Hono router dispatcher

import { app } from '../../src/index';
import { MochiEnv } from '../../src/types/env';
import { hashPassword } from '../../src/middleware/auth';
import { handleAdminMockSelect, handleAdminMockMutation } from '../mockDbAdmin';

export interface StoredUser {
  id: string;
  numeric_id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: 'player' | 'creator' | 'admin';
  coins: number;
  is_banned: number;
  is_verified: number;
  created_at: string;
  updated_at: string;
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
  is_featured: number;
  created_at: string;
  updated_at: string;
}

export interface StoredAuditLog {
  id: string;
  admin_id: string;
  admin_username?: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface DispatchedEmail {
  to: string;
  subject: string;
  code: string;
  html: string;
  sentAt: number;
}

export class MockDataStore {
  public users = new Map<string, StoredUser>();
  public otps = new Map<string, StoredOtp>();
  public games = new Map<string, StoredGame>();
  public auditLogs: StoredAuditLog[] = [];
  public sentEmails: DispatchedEmail[] = [];
  private nextNumericId = 100001;

  public clear(): void {
    this.users.clear();
    this.otps.clear();
    this.games.clear();
    this.auditLogs = [];
    this.sentEmails = [];
    this.nextNumericId = 100001;
  }

  public getNextNumericId(): number {
    return this.nextNumericId++;
  }
}

export function createE2ECloudEnv(store = new MockDataStore()): { env: MochiEnv; store: MockDataStore } {
  const adminCols = {
    users: store.users,
    games: store.games,
    auditLogs: store.auditLogs
  };

  const env: MochiEnv = {
    DB: {
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
            const meta = {} as unknown as D1Result<T>['meta'];

            if (q.includes('FROM users WHERE email = ?')) {
              const u = Array.from(store.users.values()).find((x) => x.email === String(boundParams[0]).toLowerCase());
              return { results: (u ? [u] : []) as T[], success: true, meta };
            }
            if (q.includes('FROM users WHERE username = ?')) {
              const u = Array.from(store.users.values()).find((x) => x.username.toLowerCase() === String(boundParams[0]).toLowerCase());
              return { results: (u ? [u] : []) as T[], success: true, meta };
            }
            if (q.includes('FROM users WHERE numeric_id = ?')) {
              const u = Array.from(store.users.values()).find((x) => x.numeric_id === Number(boundParams[0]));
              return { results: (u ? [u] : []) as T[], success: true, meta };
            }
            if (q.includes('FROM users WHERE id = ?')) {
              const u = store.users.get(String(boundParams[0]));
              return { results: (u ? [u] : []) as T[], success: true, meta };
            }
            if (q.includes('FROM email_verification_otps WHERE email = ?')) {
              const email = String(boundParams[0]).toLowerCase();
              const list = Array.from(store.otps.values())
                .filter((o) => o.email === email)
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
              return { results: list as T[], success: true, meta };
            }
            if (q.includes('COALESCE(MAX(numeric_id), 0)')) {
              let max = 0;
              for (const u of store.users.values()) if (u.numeric_id > max) max = u.numeric_id;
              return { results: [{ max_id: max }] as unknown as T[], success: true, meta };
            }
            if (q.includes('FROM games g') && q.includes('WHERE g.id = ? OR g.slug = ?')) {
              const key = String(boundParams[0]);
              const g = Array.from(store.games.values()).find((x) => x.id === key || x.slug === key);
              return { results: (g ? [g] : []) as unknown as T[], success: true, meta };
            }

            const adminSelected = handleAdminMockSelect(q, boundParams, adminCols);
            if (adminSelected !== null) {
              return { results: adminSelected as T[], success: true, meta };
            }

            return { results: [] as T[], success: true, meta };
          },
          async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
            const q = query.trim();
            const meta = {} as unknown as D1Result<T>['meta'];

            if (handleAdminMockMutation(q, boundParams, adminCols)) {
              return { results: [] as T[], success: true, meta };
            }

            if (q.startsWith('INSERT INTO users')) {
              const [id, num, uname, em, pwd, dname, role, cr, up] = boundParams as [string, number, string, string, string, string | null, StoredUser['role'], string, string];
              store.users.set(id, { id, numeric_id: num, username: uname, email: em, password_hash: pwd, display_name: dname, role, coins: 100, is_banned: 0, is_verified: 0, created_at: cr, updated_at: up });
            } else if (q.startsWith('INSERT INTO email_verification_otps')) {
              const [id, uid, em, code, exp, attempts, cr] = boundParams as [string, string, string, string, string, number, string];
              const createdAt = typeof cr === 'string' ? cr : new Date().toISOString();
              store.otps.set(id, { id, user_id: uid, email: em, code, expires_at: exp, attempts: typeof attempts === 'number' ? attempts : 0, created_at: createdAt });
              store.sentEmails.push({ to: em, subject: 'Your Mochi Verification Code', code, html: `<p>${code}</p>`, sentAt: Date.now() });
            } else if (q.includes('DELETE FROM email_verification_otps WHERE user_id = ? OR email = ?')) {
              const [uid, em] = boundParams as [string, string];
              for (const [k, v] of Array.from(store.otps.entries())) if (v.user_id === uid || v.email === em) store.otps.delete(k);
            } else if (q.includes('DELETE FROM email_verification_otps WHERE id = ?')) {
              store.otps.delete(String(boundParams[0]));
            } else if (q.includes('UPDATE email_verification_otps SET attempts = attempts + 1')) {
              const o = store.otps.get(String(boundParams[0]));
              if (o) o.attempts++;
            } else if (q.includes('UPDATE users SET is_verified = 1')) {
              const [up, uid] = boundParams as [string, string];
              const u = store.users.get(uid);
              if (u) { u.is_verified = 1; u.updated_at = up; }
            } else if (q.startsWith('INSERT INTO games')) {
              const [id, slug, title, description, creator_id, thumbnail_url, status, current_version_id, play_count, created_at, updated_at] = boundParams as [string, string, string, string | null, string, string | null, StoredGame['status'], string | null, number, string, string];
              store.games.set(id, { id, slug, title, description, creator_id, thumbnail_url, status, current_version_id, play_count, is_featured: 0, created_at, updated_at });
            }
            return { results: [] as T[], success: true, meta };
          }
        };
        return stmt as unknown as D1PreparedStatement;
      }
    } as unknown as D1Database,
    ASSETS: {} as R2Bucket,
    GAME_ROOM: {} as DurableObjectNamespace,
    ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173,https://playmochi.com',
    API_HOSTNAME: 'api-game.lenout.com',
    PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
    JWT_SECRET: 'test-secret-key-32-bytes-minimum-length-for-e2e'
  };
  return { env, store };
}

// Dispatches E2E requests directly against the live Hono application router
export async function e2eRequest(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  env: MochiEnv,
  _store?: MockDataStore
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};
  return await app.request(path, { method, headers, body: options.body }, env);
}

export async function seedUser(store: MockDataStore, user: Partial<StoredUser> & { email: string; username: string }): Promise<StoredUser> {
  const now = new Date().toISOString();
  const id = user.id || crypto.randomUUID();
  const stored: StoredUser = {
    id,
    numeric_id: user.numeric_id || store.getNextNumericId(),
    username: user.username,
    email: user.email.toLowerCase(),
    password_hash: user.password_hash || `salt:${await hashPassword('testpass123', 'salt')}`,
    display_name: user.display_name ?? user.username,
    role: user.role || 'player',
    coins: user.coins ?? 100,
    is_banned: user.is_banned ?? 0,
    is_verified: user.is_verified ?? 1,
    created_at: now,
    updated_at: now
  };
  store.users.set(id, stored);
  return stored;
}
