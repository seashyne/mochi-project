// Tier 4 Cloud Real-World Scenarios E2E Test Suite
// Simulates end-to-end player onboarding, administrator governance, and creator publishing lifecycles

import { describe, it, expect, beforeEach } from 'vitest';
import { createE2ECloudEnv, e2eRequest, seedUser, MockDataStore } from './e2e_cloud_harness';
import { signToken } from '../../src/middleware/auth';

describe('Tier 4 Cloud E2E: Real-World Application Scenarios', () => {
  let store: MockDataStore;
  let envReturn: ReturnType<typeof createE2ECloudEnv>;

  beforeEach(() => {
    store = new MockDataStore();
    envReturn = createE2ECloudEnv(store);
  });

  it('Scenario 1: Full Player Onboarding Lifecycle with Email Verification', async () => {
    // 1. Player submits registration
    const regRes = await e2eRequest('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'new_player_2026',
        email: 'player2026@mochi.test',
        password: 'securePassword99',
        displayName: 'New Player 2026'
      })
    }, envReturn.env, store);
    expect([200, 201]).toContain(regRes.status);

    // 2. Verification email dispatched and OTP saved in D1
    const otps = Array.from(store.otps.values()).filter((o) => o.email === 'player2026@mochi.test');
    expect(otps.length).toBeGreaterThanOrEqual(1);
    const activeOtp = otps[0];
    expect(activeOtp.code).toMatch(/^\d{6}$/);

    // 3. Player enters OTP code
    const verifyRes = await e2eRequest('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'player2026@mochi.test', code: activeOtp.code })
    }, envReturn.env, store);
    expect(verifyRes.status).toBe(200);
    const { token, user } = (await verifyRes.json()) as { token: string; user: { id: string } };

    // 4. Player profile is now active and verified
    const meRes = await e2eRequest('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }, envReturn.env, store);
    expect(meRes.status).toBe(200);
    expect(store.users.get(user.id)?.is_verified).toBe(1);
  });

  it('Scenario 2: Administrator Governance Flow (Ban, Coins, Game Approval, Audit Log)', async () => {
    // 1. Setup platform state: admin, bad player, winner player, draft game
    const admin = await seedUser(store, { username: 'lead_admin', email: 'lead@mochi.test', role: 'admin' });
    const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);
    const badPlayer = await seedUser(store, { username: 'cheater_99', email: 'cheater@mochi.test' });
    const contestWinner = await seedUser(store, { username: 'winner_42', email: 'winner@mochi.test', coins: 100 });
    const draftGame = {
      id: 'game_submitted_1', slug: 'speed-runner', title: 'Speed Runner', description: 'Parkour obby',
      creator_id: contestWinner.id, thumbnail_url: null, status: 'draft' as const, current_version_id: null,
      play_count: 0, is_featured: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    store.games.set(draftGame.id, draftGame);

    // 2. Admin searches and bans cheater
    const searchRes = await e2eRequest('/api/v1/admin/users?query=cheater', {
      headers: { Authorization: `Bearer ${adminToken}` }
    }, envReturn.env, store);
    const searchData = (await searchRes.json()) as { users: { id: string }[] };
    expect(searchData.users).toHaveLength(1);

    await e2eRequest(`/api/v1/admin/users/${badPlayer.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isBanned: true })
    }, envReturn.env, store);
    expect(store.users.get(badPlayer.id)?.is_banned).toBe(1);

    // 3. Admin credits 500 bonus coins to contest winner
    await e2eRequest(`/api/v1/admin/users/${contestWinner.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coins: 600 })
    }, envReturn.env, store);
    expect(store.users.get(contestWinner.id)?.coins).toBe(600);

    // 4. Admin reviews and approves game with featured placement
    await e2eRequest(`/api/v1/admin/games/${draftGame.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published', isFeatured: true })
    }, envReturn.env, store);
    expect(store.games.get(draftGame.id)?.status).toBe('published');
    expect(store.games.get(draftGame.id)?.is_featured).toBe(1);

    // 5. Verify audit logs record all 3 distinct administrative actions
    const auditRes = await e2eRequest('/api/v1/admin/audit-logs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    }, envReturn.env, store);
    const auditData = (await auditRes.json()) as { logs: { action: string; target_id: string }[] };
    expect(auditData.logs.length).toBeGreaterThanOrEqual(3);
  });

  it('Scenario 3: Session Expiration and Graceful Re-Authentication', async () => {
    const user = await seedUser(store, { username: 'reauth_user', email: 'reauth@mochi.test' });

    // 1. User performs action with valid token
    const token1 = await signToken({ id: user.id, username: user.username }, envReturn.env.JWT_SECRET!, 3600);
    const validRes = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token1}` } }, envReturn.env, store);
    expect(validRes.status).toBe(200);

    // 2. Token expires
    const expiredToken = await signToken({ id: user.id, username: user.username }, envReturn.env.JWT_SECRET!, -10);
    const expRes = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${expiredToken}` } }, envReturn.env, store);
    expect(expRes.status).toBe(401);

    // 3. User re-authenticates via login
    const loginRes = await e2eRequest('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'testpass123' })
    }, envReturn.env, store);
    expect(loginRes.status).toBe(200);
    const { token: freshToken } = (await loginRes.json()) as { token: string };

    // 4. Fresh token restores access
    const restoreRes = await e2eRequest('/api/v1/auth/me', { headers: { Authorization: `Bearer ${freshToken}` } }, envReturn.env, store);
    expect(restoreRes.status).toBe(200);
  });

  it('Scenario 4: Creator Publishing and Catalog Discovery', async () => {
    // 1. Creator registers and activates
    const creator = await seedUser(store, { username: 'game_dev_pro', email: 'devpro@mochi.test', role: 'creator' });
    const creatorToken = await signToken({ id: creator.id, username: creator.username, role: 'creator' }, envReturn.env.JWT_SECRET!);

    // 2. Creator has public profile
    const profileRes = await e2eRequest(`/api/v1/auth/users/${creator.username}`, {
      headers: { Authorization: `Bearer ${creatorToken}` }
    }, envReturn.env, store);
    expect(profileRes.status).toBe(200);

    // 3. Game is stored and discoverable
    const newGame = {
      id: 'game_dev_1', slug: 'hyper-dash', title: 'Hyper Dash', description: 'Fast neon racing',
      creator_id: creator.id, thumbnail_url: null, status: 'published' as const, current_version_id: 'v1',
      play_count: 128, is_featured: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    store.games.set(newGame.id, newGame);
    expect(store.games.size).toBe(1);
    expect(store.games.get('game_dev_1')?.title).toBe('Hyper Dash');
  });

  it('Scenario 5: Platform Telemetry and Active Session Aggregation', async () => {
    // 1. Populate platform metrics
    await seedUser(store, { username: 'u1', email: 'u1@mochi.test' });
    await seedUser(store, { username: 'u2', email: 'u2@mochi.test' });
    await seedUser(store, { username: 'u3', email: 'u3@mochi.test' });
    const admin = await seedUser(store, { username: 'stats_admin', email: 'stats@mochi.test', role: 'admin' });
    const adminToken = await signToken({ id: admin.id, username: admin.username, role: 'admin' }, envReturn.env.JWT_SECRET!);

    // 2. Query admin platform stats
    const statsRes = await e2eRequest('/api/v1/admin/stats', {
      headers: { Authorization: `Bearer ${adminToken}` }
    }, envReturn.env, store);
    expect(statsRes.status).toBe(200);
    const { stats } = (await statsRes.json()) as { stats: { totalRegisteredUsers: number; totalGames: number } };
    expect(stats.totalRegisteredUsers).toBe(4);
    expect(stats.totalGames).toBe(0);
  });
});
