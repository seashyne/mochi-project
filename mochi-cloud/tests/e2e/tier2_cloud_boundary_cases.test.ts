// Tier 2 Cloud Boundary & Corner Cases E2E Test Suite
// Exhaustively tests failure states, boundaries, rate limits, and security constraints

import { describe, it, expect, beforeEach } from 'vitest';
import { createE2ECloudEnv, e2eRequest, seedUser, MockDataStore } from './e2e_cloud_harness';
import { signToken } from '../../src/middleware/auth';

describe('Tier 2 Cloud E2E: Boundary & Corner Cases', () => {
  let store: MockDataStore;
  let envReturn: ReturnType<typeof createE2ECloudEnv>;

  beforeEach(() => {
    store = new MockDataStore();
    envReturn = createE2ECloudEnv(store);
  });

  // R1 Boundaries: Persistent Authentication
  describe('R1 Boundaries: Authentication and Token Integrity', () => {
    it('T2_R1_01: Rejects expired session token with 401 Unauthorized', async () => {
      const user = await seedUser(store, { username: 'exp_user', email: 'exp@mochi.test' });
      const expiredToken = await signToken({ id: user.id, username: user.username }, envReturn.env.JWT_SECRET!, -60);
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${expiredToken}` } }, envReturn.env, store);
      expect(res.status).toBe(401);
    });

    it('T2_R1_02: Rejects token signed with untrusted foreign secret key', async () => {
      const user = await seedUser(store, { username: 'for_user', email: 'for@mochi.test' });
      const foreignToken = await signToken({ id: user.id, username: user.username }, 'attacker-foreign-secret-key-32b!', 3600);
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${foreignToken}` } }, envReturn.env, store);
      expect(res.status).toBe(401);
    });

    it('T2_R1_03: Rejects tampered token payload where role is elevated', async () => {
      const user = await seedUser(store, { username: 'tamper_user', email: 'tamper@mochi.test', role: 'player' });
      const validToken = await signToken({ id: user.id, username: user.username, role: 'player' }, envReturn.env.JWT_SECRET!);
      const [header, encPayload, sig] = validToken.split('.');
      const decoded = JSON.parse(Buffer.from(encPayload, 'base64url').toString('utf8')) as { role: string };
      decoded.role = 'admin';
      const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      const forgedToken = `${header}.${forgedPayload}.${sig}`;
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${forgedToken}` } }, envReturn.env, store);
      expect(res.status).toBe(401);
    });

    it('T2_R1_04: Rejects malformed and empty Authorization header strings', async () => {
      const invalidHeaders = ['', 'Bearer', 'Bearer ', 'Token xyz', 'Basic dXNlcjpwYXNz', 'Bearer not.a.jwt.token'];
      for (const auth of invalidHeaders) {
        const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: auth } }, envReturn.env, store);
        expect(res.status).toBe(401);
      }
    });

    it('T2_R1_05: Gracefully handles non-existent user id in validly signed token', async () => {
      const ghostToken = await signToken({ id: 'ghost_id_9999', username: 'ghost' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${ghostToken}` } }, envReturn.env, store);
      expect(res.status).toBe(404);
    });
  });

  // R2 Boundaries: Email OTP Verification
  describe('R2 Boundaries: OTP Lifetime, Rate Limiting & Throttling', () => {
    it('T2_R2_01: Rejects expired OTP code (> 15 minutes old)', async () => {
      const user = await seedUser(store, { username: 'otp_exp', email: 'exp_otp@mochi.test', is_verified: 0 });
      store.otps.set('otp_old', {
        id: 'otp_old', user_id: user.id, email: user.email, code: '123456',
        expires_at: new Date(Date.now() - 1000).toISOString(), attempts: 0,
        created_at: new Date(Date.now() - 16 * 60000).toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: '123456' })
      }, envReturn.env, store);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toContain('expired');
    });

    it('T2_R2_02: Rejects incorrect 6-digit OTP code with attempt count decrement', async () => {
      const user = await seedUser(store, { username: 'wrong_otp', email: 'wrong@mochi.test', is_verified: 0 });
      store.otps.set('otp_w', {
        id: 'otp_w', user_id: user.id, email: user.email, code: '654321',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 0,
        created_at: new Date().toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: '000000' })
      }, envReturn.env, store);
      expect(res.status).toBe(400);
      expect(store.otps.get('otp_w')?.attempts).toBe(1);
    });

    it('T2_R2_03: Locks out verification code after 5 failed attempts', async () => {
      const user = await seedUser(store, { username: 'locked_otp', email: 'locked@mochi.test', is_verified: 0 });
      store.otps.set('otp_lock', {
        id: 'otp_lock', user_id: user.id, email: user.email, code: '777888',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 5,
        created_at: new Date().toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: '777888' })
      }, envReturn.env, store);
      expect(res.status).toBe(400);
    });

    it('T2_R2_04: Enforces 60-second cooldown rate limit on resend OTP', async () => {
      const user = await seedUser(store, { username: 'rate_user', email: 'rate@mochi.test', is_verified: 0 });
      store.otps.set('otp_recent', {
        id: 'otp_recent', user_id: user.id, email: user.email, code: '333444',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 0,
        created_at: new Date(Date.now() - 10000).toISOString()
      });
      const res = await e2eRequest('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      }, envReturn.env, store);
      expect(res.status).toBe(429);
      const json = (await res.json()) as { error: string; retryAfterSeconds: number };
      expect(json.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('T2_R2_05: Rejects login attempt for unverified user with 403 Forbidden', async () => {
      const user = await seedUser(store, { username: 'unverified_log', email: 'unver@mochi.test', is_verified: 0 });
      const res = await e2eRequest('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'testpass123' })
      }, envReturn.env, store);
      expect(res.status).toBe(403);
      const json = (await res.json()) as { requiresVerification: boolean };
      expect(json.requiresVerification).toBe(true);
    });

    it('T2_R2_06: Rejects malformed email on resend OTP with 400 Bad Request', async () => {
      const res = await e2eRequest('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'notanemail' })
      }, envReturn.env, store);
      expect(res.status).toBe(400);
    });
  });

  // R4 Boundaries: Admin Backoffice
  describe('R4 Boundaries: Admin RBAC and Data Validation', () => {
    it('T2_R4_01: Rejects unauthenticated request to /admin with 401 Unauthorized', async () => {
      const res = await e2eRequest('/api/v1/admin/stats', {}, envReturn.env, store);
      expect(res.status).toBe(401);
    });

    it('T2_R4_02: Rejects non-admin player role with 403 Forbidden', async () => {
      const player = await seedUser(store, { username: 'regular_p', email: 'reg@mochi.test', role: 'player' });
      const playerToken = await signToken({ id: player.id, username: player.username, role: 'player' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/admin/stats', { headers: { Authorization: `Bearer ${playerToken}` } }, envReturn.env, store);
      expect(res.status).toBe(403);
    });

    it('T2_R4_03: Rejects creator role access to /admin with 403 Forbidden', async () => {
      const creator = await seedUser(store, { username: 'creator_p', email: 'cre@mochi.test', role: 'creator' });
      const creatorToken = await signToken({ id: creator.id, username: creator.username, role: 'creator' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/admin/users', { headers: { Authorization: `Bearer ${creatorToken}` } }, envReturn.env, store);
      expect(res.status).toBe(403);
    });

    it('T2_R4_04: Handles empty search query returning default paginated result', async () => {
      const admin = await seedUser(store, { username: 'adm_srch', email: 'adm_srch@mochi.test', role: 'admin' });
      const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/admin/users?query=', { headers: { Authorization: `Bearer ${adminToken}` } }, envReturn.env, store);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; users: unknown[] };
      expect(json.ok).toBe(true);
      expect(json.users.length).toBeGreaterThanOrEqual(1);
    });

    it('T2_R4_05: Handles extreme pagination page numbers safely', async () => {
      const admin = await seedUser(store, { username: 'adm_pag', email: 'adm_pag@mochi.test', role: 'admin' });
      const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/admin/users?page=9999&limit=10', { headers: { Authorization: `Bearer ${adminToken}` } }, envReturn.env, store);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; users: unknown[] };
      expect(json.users).toHaveLength(0);
    });

    it('T2_R4_06: Returns 404 when updating non-existent user id', async () => {
      const admin = await seedUser(store, { username: 'adm_404', email: 'adm_404@mochi.test', role: 'admin' });
      const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
      const res = await e2eRequest('/api/v1/admin/users/non-existent-user-id', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: 200 })
      }, envReturn.env, store);
      expect(res.status).toBe(404);
    });
  });

  // R5 Boundaries: Standards and Security Boundaries
  describe('R5 Boundaries: Payload and Routing Stress', () => {
    it('T2_R5_01: Rejects duplicate user registration with 409 Conflict', async () => {
      await seedUser(store, { username: 'unique_user', email: 'dup@mochi.test' });
      const res = await e2eRequest('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'unique_user2', email: 'dup@mochi.test', password: 'password123' })
      }, envReturn.env, store);
      expect(res.status).toBe(409);
    });

    it('T2_R5_02: Rejects password shorter than 6 characters with 400 Bad Request', async () => {
      const res = await e2eRequest('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'short_pw_user', email: 'short@mochi.test', password: '123' })
      }, envReturn.env, store);
      expect(res.status).toBe(400);
    });

    it('T2_R5_03: Rejects malformed JSON body on register without crashing server', async () => {
      const res = await e2eRequest('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json content'
      }, envReturn.env, store);
      expect([400, 500]).toContain(res.status);
    });
  });
});
