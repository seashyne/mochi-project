// Tier 1 Cloud Feature Coverage E2E Test Suite
// Verifies happy-path execution for R1 (Persistent Auth), R2 (Email OTP), R4 (Admin Backoffice), R5 (Standards & Deployment)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createE2ECloudEnv,
  e2eRequest,
  seedUser,
  MockDataStore,
  StoredUser,
  StoredGame,
  StoredAuditLog
} from './e2e_cloud_harness';
import { signToken, verifyToken } from '../../src/middleware/auth';

describe('Tier 1 Cloud E2E: Feature Coverage (Happy Path)', () => {
  let store: MockDataStore;
  let envReturn: ReturnType<typeof createE2ECloudEnv>;

  beforeEach(() => {
    store = new MockDataStore();
    envReturn = createE2ECloudEnv(store);
  });

  // R1: Persistent Authentication & Session Memory
  describe('R1: Persistent Authentication and Session Verification', () => {
    it('T1_R1_01: WebCrypto HMAC-SHA256 signs valid token with 24h expiration', async () => {
      const payload = { id: 'usr_t1_1', username: 'alex', role: 'player' };
      const token = await signToken(payload, envReturn.env.JWT_SECRET!, 86400);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      const verified = await verifyToken<typeof payload>(token, envReturn.env.JWT_SECRET!);
      expect(verified?.id).toBe(payload.id);
      expect(verified?.username).toBe(payload.username);
    });

    it('T1_R1_02: GET /api/v1/auth/me returns authenticated user profile with Bearer token', async () => {
      const user = await seedUser(store, { username: 'gamer1', email: 'gamer1@mochi.test', role: 'player' });
      const token = await signToken({ id: user.id, username: user.username, role: user.role }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }, envReturn.env, store);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { user: { username: string; email: string } };
      expect(data.user.username).toBe('gamer1');
      expect(data.user.email).toBe('gamer1@mochi.test');
    });

    it('T1_R1_03: User profile response sanitizes password hash from public payload', async () => {
      const user = await seedUser(store, { username: 'safeuser', email: 'safe@mochi.test', role: 'player' });
      const token = await signToken({ id: user.id, username: user.username, role: user.role }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }, envReturn.env, store);
      const data = (await res.json()) as Record<string, unknown>;
      const returnedUser = (data.user || data) as Record<string, unknown>;
      expect(returnedUser.password_hash).toBeUndefined();
      expect(returnedUser.passwordHash).toBeUndefined();
    });

    it('T1_R1_04: Public profile lookup by username retrieves user details', async () => {
      const user = await seedUser(store, { username: 'starplayer', email: 'star@mochi.test', role: 'player' });
      const res = await e2eRequest(`/api/v1/auth/users/${user.username}`, {}, envReturn.env, store);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { user: { username: string } };
      expect(data.user.username).toBe('starplayer');
    });

    it('T1_R1_05: Session verification preserves numeric user id in token and profile', async () => {
      const user = await seedUser(store, { username: 'numuser', email: 'num@mochi.test', numeric_id: 100099 });
      const token = await signToken({ id: user.id, numericId: user.numeric_id, username: user.username }, envReturn.env.JWT_SECRET!);
      const verified = await verifyToken<{ numericId: number }>(token, envReturn.env.JWT_SECRET!);
      expect(verified?.numericId).toBe(100099);
    });
  });

  // R2: Real Email OTP Verification
  describe('R2: Real Email OTP Signup Verification', () => {
    it('T1_R2_01: Resend OTP generates 6-digit code with 15-minute expiration', async () => {
      await seedUser(store, { username: 'otpuser', email: 'otp@mochi.test', is_verified: 0 });
      const res = await e2eRequest('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'otp@mochi.test' })
      }, envReturn.env, store);
      expect(res.status).toBe(200);
      const otps = Array.from(store.otps.values());
      expect(otps.length).toBeGreaterThanOrEqual(1);
      const latest = otps[0];
      expect(latest.code).toMatch(/^\d{6}$/);
      expect(new Date(latest.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('T1_R2_02: MailChannels transactional email is recorded with recipient and OTP code', async () => {
      await seedUser(store, { username: 'emailuser', email: 'email@mochi.test', is_verified: 0 });
      await e2eRequest('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'email@mochi.test' })
      }, envReturn.env, store);
      expect(store.sentEmails).toHaveLength(1);
      expect(store.sentEmails[0].to).toBe('email@mochi.test');
      expect(store.sentEmails[0].code).toMatch(/^\d{6}$/);
    });

    it('T1_R2_03: POST /api/v1/auth/verify-otp successfully marks account is_verified = 1', async () => {
      const user = await seedUser(store, { username: 'verifyuser', email: 'verify@mochi.test', is_verified: 0 });
      const code = '543210';
      store.otps.set('otp_test_1', {
        id: 'otp_test_1',
        user_id: user.id,
        email: user.email,
        code,
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        attempts: 0,
        created_at: new Date().toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code })
      }, envReturn.env, store);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; token: string };
      expect(json.success).toBe(true);
      expect(typeof json.token).toBe('string');
      expect(store.users.get(user.id)?.is_verified).toBe(1);
    });

    it('T1_R2_04: Verification consumes and cleans up used OTP code from database', async () => {
      const user = await seedUser(store, { username: 'cleanupuser', email: 'clean@mochi.test', is_verified: 0 });
      store.otps.set('otp_clean_1', {
        id: 'otp_clean_1',
        user_id: user.id,
        email: user.email,
        code: '112233',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        attempts: 0,
        created_at: new Date().toISOString()
      });
      await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: '112233' })
      }, envReturn.env, store);
      expect(store.otps.has('otp_clean_1')).toBe(false);
    });

    it('T1_R2_05: Valid verification returns persistent JWT ready for client storage', async () => {
      const user = await seedUser(store, { username: 'jwtuser', email: 'jwt@mochi.test', is_verified: 0 });
      store.otps.set('otp_jwt', {
        id: 'otp_jwt',
        user_id: user.id,
        email: user.email,
        code: '998877',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        attempts: 0,
        created_at: new Date().toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: '998877' })
      }, envReturn.env, store);
      const { token } = (await res.json()) as { token: string };
      const verified = await verifyToken<{ id: string; email: string }>(token, envReturn.env.JWT_SECRET!);
      expect(verified?.id).toBe(user.id);
      expect(verified?.email).toBe(user.email);
    });
  });

  // R4: Comprehensive Admin Backoffice Portal
  describe('R4: Admin Backoffice Operations and RBAC Enforcement', () => {
    let adminToken: string;
    let adminUser: StoredUser;

    beforeEach(async () => {
      adminUser = await seedUser(store, { username: 'admin1', email: 'admin@mochi.test', role: 'admin' });
      adminToken = await signToken({ id: adminUser.id, username: adminUser.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    });

    it('T1_R4_01: GET /api/v1/admin/stats returns platform telemetry for administrators', async () => {
      await seedUser(store, { username: 'p1', email: 'p1@mochi.test' });
      const res = await e2eRequest('/api/v1/admin/stats', { headers: { Authorization: `Bearer ${adminToken}` } }, envReturn.env, store);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; stats: { totalRegisteredUsers: number; totalGames: number } };
      expect(data.ok).toBe(true);
      expect(data.stats.totalRegisteredUsers).toBe(2);
    });

    it('T1_R4_02: GET /api/v1/admin/users lists paginated player accounts', async () => {
      await seedUser(store, { username: 'player_alpha', email: 'alpha@mochi.test' });
      await seedUser(store, { username: 'player_beta', email: 'beta@mochi.test' });
      const res = await e2eRequest('/api/v1/admin/users?page=1&limit=10', { headers: { Authorization: `Bearer ${adminToken}` } }, envReturn.env, store);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; users: StoredUser[]; total: number };
      expect(data.ok).toBe(true);
      expect(data.total).toBe(3);
    });

    it('T1_R4_03: PATCH /api/v1/admin/users/:id updates player coin balance and ban status', async () => {
      const player = await seedUser(store, { username: 'player_mod', email: 'mod@mochi.test', coins: 50, is_banned: 0 });
      const res = await e2eRequest(`/api/v1/admin/users/${player.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: 500, isBanned: true })
      }, envReturn.env, store);
      expect(res.status).toBe(200);
      expect(store.users.get(player.id)?.coins).toBe(500);
      expect(store.users.get(player.id)?.is_banned).toBe(1);
    });

    it('T1_R4_04: PATCH /api/v1/admin/games/:id approves and features game submission', async () => {
      const game: StoredGame = {
        id: 'game_1', slug: 'cosmic-run', title: 'Cosmic Run', description: 'Obstacle game',
        creator_id: 'c1', thumbnail_url: null, status: 'draft', current_version_id: null,
        play_count: 0, is_featured: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      store.games.set(game.id, game);
      const res = await e2eRequest(`/api/v1/admin/games/${game.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published', isFeatured: true })
      }, envReturn.env, store);
      expect(res.status).toBe(200);
      expect(store.games.get('game_1')?.status).toBe('published');
      expect(store.games.get('game_1')?.is_featured).toBe(1);
    });

    it('T1_R4_05: Administrative actions record immutable audit logs with admin ID', async () => {
      const player = await seedUser(store, { username: 'target_player', email: 'target@mochi.test' });
      await e2eRequest(`/api/v1/admin/users/${player.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: 1000 })
      }, envReturn.env, store);
      const logRes = await e2eRequest('/api/v1/admin/audit-logs', { headers: { Authorization: `Bearer ${adminToken}` } }, envReturn.env, store);
      expect(logRes.status).toBe(200);
      const data = (await logRes.json()) as { ok: boolean; logs: StoredAuditLog[] };
      expect(data.logs.length).toBeGreaterThanOrEqual(1);
      expect(data.logs[0].admin_id).toBe(adminUser.id);
      expect(data.logs[0].action).toBe('UPDATE_USER');
    });
  });

  // R5: Code Standards, Quality & Deployment
  describe('R5: Cloud Deployment & Standards Conformance', () => {
    it('T1_R5_01: GET /api/v1/health returns ok status and service version', async () => {
      const res = await e2eRequest('/api/v1/health', {}, envReturn.env, store);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string; service: string };
      expect(json.status).toBe('ok');
      expect(json.service).toBe('mochi-cloud');
    });

    it('T1_R5_02: Dynamic CORS preflight returns 204 with allowed origin', async () => {
      const res = await e2eRequest('/api/v1/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://game.lenout.com' }
      }, envReturn.env, store);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://game.lenout.com');
    });

    it('T1_R5_03: Dynamic CORS allows custom staging domains from ALLOWED_ORIGINS', async () => {
      const res = await e2eRequest('/api/v1/health', {
        headers: { Origin: 'https://playmochi.com' }
      }, envReturn.env, store);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://playmochi.com');
    });

    it('T1_R5_04: Global 404 handler returns structured JSON error', async () => {
      const res = await e2eRequest('/api/v1/invalid-route-xyz', {}, envReturn.env, store);
      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBeDefined();
    });

    it('T1_R5_05: Environment bindings contain required production variables', () => {
      expect(envReturn.env.API_HOSTNAME).toBe('api-game.lenout.com');
      expect(envReturn.env.PUBLIC_ASSETS_URL).toBe('https://assets-game.lenout.com');
      expect(envReturn.env.JWT_SECRET).toBeDefined();
    });
  });
});
