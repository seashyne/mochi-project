import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { signToken } from '../src/middleware/auth';
import { buildMimeEmailMessage, sendTransactionalEmail } from '../src/services/emailService';

describe('Mochi Cloud API - Admin Backoffice, RBAC & Production Email', () => {
  let env: MochiEnv;
  const secret = 'admin-suite-hmac-secret-key-32-chars-min';
  let adminToken: string;
  let adminId: string;
  let playerToken: string;
  let playerId: string;

  async function registerAndVerify(username: string, email: string, password = 'password123') {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, displayName: username.toUpperCase() })
      },
      env
    );
    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(email)
      .first<{ code: string }>();
    const verifyRes = await app.request(
      '/api/v1/auth/verify-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp!.code })
      },
      env
    );
    return (await verifyRes.json()) as {
      token: string;
      user: { id: string; username: string; coins?: number; isBanned?: boolean };
    };
  }

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: secret
    };

    const adminAuth = await registerAndVerify('rootadmin', 'admin@mochi.test');
    adminId = adminAuth.user.id;
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind('admin', adminId).run();
    adminToken = await signToken(
      { id: adminId, username: 'rootadmin', email: 'admin@mochi.test', role: 'admin' },
      secret
    );

    const playerAuth = await registerAndVerify('playerone', 'player1@mochi.test');
    playerId = playerAuth.user.id;
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind('player', playerId).run();
    playerToken = playerAuth.token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces RBAC returning 401 without token, 403 for non-admin or banned admin, and 200 for live admin', async () => {
    const unauthRes = await app.request('/api/v1/admin/stats', {}, env);
    expect(unauthRes.status).toBe(401);

    const forbiddenRes = await app.request(
      '/api/v1/admin/stats',
      { headers: { Authorization: `Bearer ${playerToken}` } },
      env
    );
    expect(forbiddenRes.status).toBe(403);

    const okRes = await app.request(
      '/api/v1/admin/stats',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );
    expect(okRes.status).toBe(200);
    const statsJson = (await okRes.json()) as {
      ok: boolean;
      stats: { activeOnlineUsers: number; totalRegisteredUsers: number; totalGames: number; totalGameplaySessions: number };
    };
    expect(statsJson.ok).toBe(true);
    expect(statsJson.stats.activeOnlineUsers).toBeGreaterThanOrEqual(1);
    expect(statsJson.stats.totalRegisteredUsers).toBe(2);

    // Suspended admin loses backoffice access immediately
    await env.DB.prepare('UPDATE users SET is_banned = ? WHERE id = ?').bind(1, adminId).run();
    const suspendedAdminRes = await app.request(
      '/api/v1/admin/stats',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );
    expect(suspendedAdminRes.status).toBe(403);
  });

  it('searches users, clamps negative/fractional coins, promotes roles, and blocks banned users from login and /me', async () => {
    const searchRes = await app.request(
      '/api/v1/admin/users?query=playerone&page=1&limit=10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );
    expect(searchRes.status).toBe(200);
    const searchData = (await searchRes.json()) as {
      ok: boolean;
      total: number;
      users: Array<{ id: string; coins: number; isBanned: boolean; is_banned: number; password_hash?: string }>;
    };
    expect(searchData.total).toBe(1);
    expect(searchData.users[0].id).toBe(playerId);
    expect(searchData.users[0].coins).toBe(100);
    expect(searchData.users[0].password_hash).toBeUndefined();

    // Clamp negative coins to 0 and promote role to creator
    const clampRes = await app.request(
      `/api/v1/admin/users/${playerId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins: -250.75, role: 'creator' })
      },
      env
    );
    expect(clampRes.status).toBe(200);
    const clampJson = (await clampRes.json()) as { user: { coins: number; role: string } };
    expect(clampJson.user.coins).toBe(0);
    expect(clampJson.user.role).toBe('creator');

    // Enriched /me reflects coins and isBanned before suspension
    const meBefore = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${playerToken}` } },
      env
    );
    expect(meBefore.status).toBe(200);
    const meBeforeJson = (await meBefore.json()) as { user: { coins: number; isBanned: boolean } };
    expect(meBeforeJson.user.coins).toBe(0);
    expect(meBeforeJson.user.isBanned).toBe(false);

    // Ban player and verify 403 on login and /me
    const banRes = await app.request(
      `/api/v1/admin/users/${playerId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBanned: true })
      },
      env
    );
    expect(banRes.status).toBe(200);

    const blockedLogin = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'player1@mochi.test', password: 'password123' })
      },
      env
    );
    expect(blockedLogin.status).toBe(403);
    const blockedBody = (await blockedLogin.json()) as { error: string };
    expect(blockedBody.error).toBe('Account has been suspended');

    const blockedMe = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${playerToken}` } },
      env
    );
    expect(blockedMe.status).toBe(403);
  });

  it('moderates games, toggles featured flag, and records ordered audit logs', async () => {
    const createRes = await app.request(
      '/api/v1/games',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Neon Sky Arena', description: 'Multiplayer sky arena' })
      },
      env
    );
    expect(createRes.status).toBe(201);
    const { game } = (await createRes.json()) as { game: { id: string } };

    const modRes = await app.request(
      `/api/v1/admin/games/${game.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published', isFeatured: true })
      },
      env
    );
    expect(modRes.status).toBe(200);
    const modJson = (await modRes.json()) as { game: { status: string; isFeatured: boolean; is_featured: number } };
    expect(modJson.game.status).toBe('published');
    expect(modJson.game.isFeatured).toBe(true);
    expect(modJson.game.is_featured).toBe(1);

    const missingGameRes = await app.request(
      '/api/v1/admin/games/missing-game-id',
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      },
      env
    );
    expect(missingGameRes.status).toBe(404);

    const logsRes = await app.request(
      '/api/v1/admin/audit-logs?page=1&limit=10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );
    expect(logsRes.status).toBe(200);
    const logsData = (await logsRes.json()) as {
      ok: boolean;
      total: number;
      logs: Array<{ action: string; adminId: string; adminUsername: string; targetType: string; targetId: string }>;
    };
    expect(logsData.total).toBe(1);
    expect(logsData.logs[0].action).toBe('MODERATE_GAME');
    expect(logsData.logs[0].adminId).toBe(adminId);
    expect(logsData.logs[0].adminUsername).toBe('rootadmin');
    expect(logsData.logs[0].targetType).toBe('game');
    expect(logsData.logs[0].targetId).toBe(game.id);
  });

  it('constructs RFC 5322 MIME emails and cascades production email providers cleanly', async () => {
    const mime = buildMimeEmailMessage(
      'noreply@lenout.com',
      'Mochi Platform',
      {
        toEmail: 'player@lenout.com',
        toName: 'Player One',
        subject: 'Verification Code: 884422',
        textContent: 'Code: 884422',
        htmlContent: '<p>Code: 884422</p>'
      },
      'msg-123@lenout.com'
    );
    expect(mime).toContain('MIME-Version: 1.0\r\n');
    expect(mime).toContain('From: "Mochi Platform" <noreply@lenout.com>\r\n');
    expect(mime).toContain('Message-ID: <msg-123@lenout.com>\r\n');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 202, headers: { 'x-message-id': 'mc-live-99' } })
    );

    const prodEnv: MochiEnv = {
      ...env,
      ENVIRONMENT: 'production',
      API_HOSTNAME: 'api-game.lenout.com',
      MAILCHANNELS_API_KEY: 'mc-test-api-key'
    };
    const sendRes = await sendTransactionalEmail(prodEnv, {
      toEmail: 'player@lenout.com',
      subject: 'Test',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi'
    });
    expect(sendRes.success).toBe(true);
    expect(sendRes.messageId).toBe('mc-live-99');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
