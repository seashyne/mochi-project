// Tier 3 Cloud Cross-Feature Combinations E2E Test Suite
// Evaluates pairwise interactions across auth, OTP, admin governance, and catalog systems

import { describe, it, expect, beforeEach } from 'vitest';
import { createE2ECloudEnv, e2eRequest, seedUser, MockDataStore } from './e2e_cloud_harness';
import { signToken } from '../../src/middleware/auth';

describe('Tier 3 Cloud E2E: Cross-Feature Combinations (Pairwise)', () => {
  let store: MockDataStore;
  let envReturn: ReturnType<typeof createE2ECloudEnv>;

  beforeEach(() => {
    store = new MockDataStore();
    envReturn = createE2ECloudEnv(store);
  });

  it('T3_Pair_01: Signup -> D1 OTP Generation -> Verification -> Persistent Session -> Access /me', async () => {
    // 1. Register new user
    const regRes = await e2eRequest('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'lifecycle_user',
        email: 'lifecycle@mochi.test',
        password: 'password123',
        displayName: 'Lifecycle User'
      })
    }, envReturn.env, store);
    expect([200, 201]).toContain(regRes.status);

    // 2. Extract generated OTP from store
    const otps = Array.from(store.otps.values()).filter((o) => o.email === 'lifecycle@mochi.test');
    expect(otps.length).toBeGreaterThanOrEqual(1);
    const otpCode = otps[0].code;

    // 3. Verify OTP
    const verifyRes = await e2eRequest('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lifecycle@mochi.test', code: otpCode })
    }, envReturn.env, store);
    expect(verifyRes.status).toBe(200);
    const { token } = (await verifyRes.json()) as { token: string };

    // 4. Access authenticated /me endpoint using token
    const meRes = await e2eRequest('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }, envReturn.env, store);
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as { user: { username: string; email: string } };
    expect(meData.user.username).toBe('lifecycle_user');
  });

  it('T3_Pair_02: Player Session -> Admin Denial (403) -> Admin Role Promotion -> Admin Access Granted', async () => {
    // 1. User starts as player
    const player = await seedUser(store, { username: 'promoted_player', email: 'promote@mochi.test', role: 'player' });
    const playerToken = await signToken({ id: player.id, username: player.username, role: 'player' }, envReturn.env.JWT_SECRET!);

    // 2. Access to admin endpoint denied
    const forbiddenRes = await e2eRequest('/api/v1/admin/stats', {
      headers: { Authorization: `Bearer ${playerToken}` }
    }, envReturn.env, store);
    expect(forbiddenRes.status).toBe(403);

    // 3. Admin promotes user
    const admin = await seedUser(store, { username: 'superadmin', email: 'super@mochi.test', role: 'admin' });
    const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    const promoteRes = await e2eRequest(`/api/v1/admin/users/${player.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' })
    }, envReturn.env, store);
    expect(promoteRes.status).toBe(200);

    // 4. Promoted user accesses admin endpoint successfully
    const newAdminToken = await signToken({ id: player.id, username: player.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    const allowedRes = await e2eRequest('/api/v1/admin/stats', {
      headers: { Authorization: `Bearer ${newAdminToken}` }
    }, envReturn.env, store);
    expect(allowedRes.status).toBe(200);
  });

  it('T3_Pair_03: Admin Bans Player -> Player Status Updated -> Audit Log Emitted', async () => {
    const admin = await seedUser(store, { username: 'mod_admin', email: 'mod@mochi.test', role: 'admin' });
    const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    const player = await seedUser(store, { username: 'toxic_user', email: 'toxic@mochi.test', is_banned: 0 });

    // Ban player
    const banRes = await e2eRequest(`/api/v1/admin/users/${player.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isBanned: true })
    }, envReturn.env, store);
    expect(banRes.status).toBe(200);
    expect(store.users.get(player.id)?.is_banned).toBe(1);

    // Verify audit log
    const auditRes = await e2eRequest('/api/v1/admin/audit-logs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    }, envReturn.env, store);
    const auditData = (await auditRes.json()) as { ok: boolean; logs: { target_id: string; action: string }[] };
    expect(auditData.logs.some((l) => l.target_id === player.id && l.action === 'UPDATE_USER')).toBe(true);
  });

  it('T3_Pair_04: Creator Submits Game -> Admin Approves & Features -> Catalog Visibility Reflected', async () => {
    const creator = await seedUser(store, { username: 'creator_x', email: 'cx@mochi.test', role: 'creator' });
    const game = {
      id: 'game_c1', slug: 'nebula-quest', title: 'Nebula Quest', description: 'Space exploration',
      creator_id: creator.id, thumbnail_url: null, status: 'draft' as const, current_version_id: null,
      play_count: 0, is_featured: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    store.games.set(game.id, game);

    // Admin moderates
    const admin = await seedUser(store, { username: 'lead_mod', email: 'lead@mochi.test', role: 'admin' });
    const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    const modRes = await e2eRequest(`/api/v1/admin/games/${game.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published', isFeatured: true })
    }, envReturn.env, store);
    expect(modRes.status).toBe(200);

    // Verify catalog reflects featured status
    const listRes = await e2eRequest('/api/v1/admin/games', {
      headers: { Authorization: `Bearer ${adminToken}` }
    }, envReturn.env, store);
    const listData = (await listRes.json()) as { ok: boolean; games: { id: string; status: string; is_featured: number }[] };
    const savedGame = listData.games.find((g) => g.id === 'game_c1');
    expect(savedGame?.status).toBe('published');
    expect(savedGame?.is_featured).toBe(1);
  });

  it('T3_Pair_05: Failed OTP Attempts Increment -> Lockout -> Resend Code Resets Lockout State', async () => {
    const user = await seedUser(store, { username: 'retry_user', email: 'retry@mochi.test', is_verified: 0 });
    store.otps.set('otp_rt', {
      id: 'otp_rt', user_id: user.id, email: user.email, code: '445566',
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 4,
      created_at: new Date(Date.now() - 70000).toISOString()
    });

    // 5th failed attempt locks out code
    await e2eRequest('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, code: '000000' })
    }, envReturn.env, store);
    expect(store.otps.get('otp_rt')?.attempts).toBe(5);

    // Request fresh code after cooldown
    const resendRes = await e2eRequest('/api/v1/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email })
    }, envReturn.env, store);
    expect(resendRes.status).toBe(200);

    // New code has 0 attempts
    const latestOtp = Array.from(store.otps.values()).filter((o) => o.email === user.email).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    expect(latestOtp.attempts).toBe(0);
    expect(latestOtp.code).toMatch(/^\d{6}$/);
  });
});
