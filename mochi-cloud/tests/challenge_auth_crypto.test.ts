import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { signToken, verifyToken } from '../src/middleware/auth';

describe('Adversarial Challenge Probe 3: Auth & Cryptography Stress', () => {
  let env: MochiEnv;
  const testSecret = 'challenge-test-secret-32-chars-long';

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: testSecret
    };
  });

  it('Probe 3A: signs and verifies a valid token payload', async () => {
    const payload = {
      id: 'usr_stress_1',
      username: 'mochidev',
      email: 'dev@mochi.test',
      role: 'creator'
    };

    const token = await signToken(payload, testSecret, 3600);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyToken<typeof payload>(token, testSecret);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(payload.id);
    expect(verified?.username).toBe(payload.username);
  });

  it('Probe 3B: rejects expired tokens', async () => {
    const payload = { id: 'usr_exp', username: 'bob', role: 'player' };
    const token = await signToken(payload, testSecret, -100);

    const verified = await verifyToken(token, testSecret);
    expect(verified).toBeNull();
  });

  it('Probe 3C: rejects tokens signed with mismatched secret', async () => {
    const payload = { id: 'usr_mismatch', username: 'charlie', role: 'player' };
    const token = await signToken(payload, 'wrong-secret-key-32-chars-long', 3600);

    const verified = await verifyToken(token, testSecret);
    expect(verified).toBeNull();
  });

  it('Probe 3D: rejects tampered payload (privilege escalation)', async () => {
    const payload = { id: 'usr_player_9', username: 'eve', role: 'player' };
    const token = await signToken(payload, testSecret, 3600);

    const [header, encPayload, sig] = token.split('.');
    const decoded = JSON.parse(
      Buffer.from(encPayload, 'base64url').toString('utf8')
    );
    decoded.role = 'admin';
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString(
      'base64url'
    );

    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
    const verified = await verifyToken(tamperedToken, testSecret);
    expect(verified).toBeNull();
  });

  it('Probe 3E: rejects tampered signature and algorithm substitution', async () => {
    const payload = { id: 'usr_attack', username: 'mallory', role: 'creator' };
    const token = await signToken(payload, testSecret, 3600);

    const [header, encPayload, sig] = token.split('.');

    // Tampered signature
    const corruptSig = sig.slice(0, -3) + 'xyz';
    expect(await verifyToken(`${header}.${encPayload}.${corruptSig}`, testSecret)).toBeNull();

    // Alg none attack
    const noneHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');
    expect(await verifyToken(`${noneHeader}.${encPayload}.${sig}`, testSecret)).toBeNull();
  });

  it('Probe 3F: handles malformed token inputs gracefully without crashing', async () => {
    const malformedInputs = [
      '',
      'not-a-token',
      'a.b',
      'a.b.c.d',
      '!!!.@@@.###',
      'undefined',
      'null'
    ];

    for (const input of malformedInputs) {
      const result = await verifyToken(input, testSecret);
      expect(result).toBeNull();
    }
  });

  it('Probe 3G: validates endpoint protection via /api/v1/auth/me', async () => {
    // 1. Register a user so they exist in D1
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'audituser',
          email: 'audit@mochi.test',
          password: 'password123',
          displayName: 'Audit User'
        })
      },
      env
    );
    expect(regRes.status).toBe(201);
    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind('audit@mochi.test').first<{ code: string }>();
    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'audit@mochi.test', code: otp!.code })
    }, env);
    const { token, user } = (await verifyRes.json()) as {
      token: string;
      user: { id: string };
    };

    // 2. Authorized request with valid token -> 200
    const meRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );
    expect(meRes.status).toBe(200);

    // 3. Expired token for same user -> 401
    const expiredToken = await signToken(
      { id: user.id, username: 'audituser', email: 'audit@mochi.test', role: 'creator' },
      testSecret,
      -30
    );
    const expRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${expiredToken}` } },
      env
    );
    expect(expRes.status).toBe(401);

    // 4. Tampered token -> 401
    const tamperedRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${token}tampered` } },
      env
    );
    expect(tamperedRes.status).toBe(401);

    // 5. No token / Missing header -> 401
    const noHeaderRes = await app.request('/api/v1/auth/me', {}, env);
    expect(noHeaderRes.status).toBe(401);
  });
});
