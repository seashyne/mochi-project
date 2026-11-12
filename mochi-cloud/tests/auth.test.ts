import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

describe('Mochi Cloud API - Authentication Routes', () => {
  let env: MochiEnv;

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
  });

  const testUser = {
    username: 'creator1',
    email: 'creator1@mochi.dev',
    password: 'password123',
    displayName: 'Creator One'
  };

  it('registers a new user and dispatches email verification OTP', async () => {
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      },
      env
    );
    expect(res.status).toBe(201);

    const json = (await res.json()) as {
      success: boolean;
      message: string;
      email: string;
      token?: string;
    };
    expect(json.success).toBe(true);
    expect(json.email).toBe(testUser.email);
    expect(json.message).toBe('Verification email sent');
    expect(json.token).toBeUndefined();
  });

  it('rejects duplicate email registration with 409 Conflict', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      },
      env
    );

    const duplicateRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...testUser, username: 'creator2' })
      },
      env
    );
    expect(duplicateRes.status).toBe(409);
  });

  it('authenticates valid credentials and rejects invalid passwords', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      },
      env
    );

    // Verify OTP code to activate the user account
    const otp = await env.DB
      .prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(testUser.email)
      .first<{ code: string }>();

    await app.request(
      '/api/v1/auth/verify-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, code: otp!.code })
      },
      env
    );

    // Successful login for verified user
    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      },
      env
    );
    expect(loginRes.status).toBe(200);
    const loginJson = (await loginRes.json()) as { token: string };
    expect(typeof loginJson.token).toBe('string');

    // Failed login with wrong password
    const failedRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrongpassword'
        })
      },
      env
    );
    expect(failedRes.status).toBe(401);
  });

  it('verifies /me with Bearer token and rejects unauthorized requests', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      },
      env
    );

    const otp = await env.DB
      .prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(testUser.email)
      .first<{ code: string }>();

    const verifyRes = await app.request(
      '/api/v1/auth/verify-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, code: otp!.code })
      },
      env
    );
    const { token } = (await verifyRes.json()) as { token: string };

    // Authorized request
    const meRes = await app.request(
      '/api/v1/auth/me',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      },
      env
    );
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as { user: { email: string } };
    expect(meJson.user.email).toBe(testUser.email);

    // Unauthorized without token
    const noAuthRes = await app.request('/api/v1/auth/me', { method: 'GET' }, env);
    expect(noAuthRes.status).toBe(401);
  });

  it('supports instant frictionless registration with birthday and gender', async () => {
    const instantUser = {
      username: 'speedyplayer',
      password: 'password123',
      birthday: '2010-05-15',
      gender: 'male',
      instant: true
    };

    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instantUser)
      },
      env
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; token: string; user: { username: string; email: string; isVerified: boolean } };
    expect(json.success).toBe(true);
    expect(json.token).toBeDefined();
    expect(json.user.username).toBe('speedyplayer');
    expect(json.user.email).toBe('speedyplayer@game.lenout.com');
    expect(json.user.isVerified).toBe(true);

    // Can log in with username instead of email
    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'speedyplayer', password: 'password123' })
      },
      env
    );
    expect(loginRes.status).toBe(200);

    // Can link / verify official email later
    const reqLinkRes = await app.request(
      '/api/v1/auth/request-email-verification',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${json.token}` },
        body: JSON.stringify({ email: 'speedy@realmail.test' })
      },
      env
    );
    expect(reqLinkRes.status).toBe(200);

    const otp = await env.DB
      .prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind('speedy@realmail.test')
      .first<{ code: string }>();
    expect(otp?.code).toBeDefined();

    const confirmRes = await app.request(
      '/api/v1/auth/confirm-email-verification',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${json.token}` },
        body: JSON.stringify({ email: 'speedy@realmail.test', code: otp!.code })
      },
      env
    );
    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as { user: { email: string; isVerified: boolean } };
    expect(confirmJson.user.email).toBe('speedy@realmail.test');
    expect(confirmJson.user.isVerified).toBe(true);
  });
});
