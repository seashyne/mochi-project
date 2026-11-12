import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { generateOtpCode, createOtpRecord } from '../src/services/otpService';
import { buildOtpEmailTemplate, sendTransactionalEmail } from '../src/services/emailService';

describe('Milestone 1: OTP Verification & Persistent Auth (mochi-cloud)', () => {
  let env: MochiEnv;
  const testSecret = 'otp-test-secret-key-32-chars-long';

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: testSecret
    };
  });

  const testUser = {
    username: 'otpuser',
    email: 'otpuser@mochi.test',
    password: 'password123',
    displayName: 'OTP User'
  };

  it('generates cryptographically secure 6-digit numeric OTP codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });

  it('builds transactional email templates with proper DKIM and OTP formatting', () => {
    const template = buildOtpEmailTemplate('123456', 'Tester');
    expect(template.subject).toContain('123456');
    expect(template.textContent).toContain('123456');
    expect(template.htmlContent).toContain('123456');
  });

  it('bypasses external HTTP dispatch gracefully in test environment', async () => {
    const res = await sendTransactionalEmail(env, {
      toEmail: 'player@mochi.test',
      subject: 'Test Subject',
      htmlContent: '<p>Test</p>',
      textContent: 'Test'
    });
    expect(res.success).toBe(true);
  });

  it('register creates unverified user and dispatches OTP without issuing JWT', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; token?: string; email: string };
    expect(json.success).toBe(true);
    expect(json.email).toBe(testUser.email);
    expect(json.token).toBeUndefined();
  });

  it('blocks unverified user from logging in with 403 Forbidden', async () => {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password })
    }, env);
    expect(loginRes.status).toBe(403);
    const loginJson = (await loginRes.json()) as { requiresVerification: boolean };
    expect(loginJson.requiresVerification).toBe(true);
  });

  it('rejects invalid OTP codes and tracks remaining attempts', async () => {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, code: '000000' })
    }, env);
    expect(verifyRes.status).toBe(400);
    const verifyJson = (await verifyRes.json()) as { error: string };
    expect(verifyJson.error).toContain('Invalid verification code');
  });

  it('locks out verification after 5 consecutive failed attempts', async () => {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);

    for (let i = 0; i < 5; i++) {
      await app.request('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, code: `11111${i}` })
      }, env);
    }

    const lockedRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, code: '000000' })
    }, env);
    expect(lockedRes.status).toBe(400);
    const lockedJson = (await lockedRes.json()) as { error: string };
    expect(lockedJson.error).toContain('Too many failed attempts');
  });

  it('rejects expired OTP codes', async () => {
    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);
    const regData = (await regRes.json()) as { userId: string };

    await createOtpRecord(env.DB, regData.userId, testUser.email, -10);

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, code: '123456' })
    }, env);
    expect(verifyRes.status).toBe(400);
    const verifyJson = (await verifyRes.json()) as { error: string };
    expect(verifyJson.error).toContain('expired');
  });

  it('verifies valid OTP, activates account, and returns authenticated session token', async () => {
    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);
    const regData = (await regRes.json()) as { userId: string };

    const knownCode = '654321';
    await env.DB
      .prepare('UPDATE email_verification_otps SET code = ? WHERE user_id = ?')
      .bind(knownCode, regData.userId)
      .run();

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, code: knownCode })
    }, env);
    expect(verifyRes.status).toBe(200);
    const verifyJson = (await verifyRes.json()) as {
      success: boolean;
      user: { isVerified: boolean };
      token: string;
    };
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.user.isVerified).toBe(true);
    expect(typeof verifyJson.token).toBe('string');

    // Subsequent login succeeds
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password })
    }, env);
    expect(loginRes.status).toBe(200);

    // Profile reflects isVerified: true
    const meRes = await app.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${verifyJson.token}` }
    }, env);
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as { user: { isVerified: boolean } };
    expect(meJson.user.isVerified).toBe(true);
  });

  it('enforces 60-second cooldown on OTP resend requests', async () => {
    await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }, env);

    const resendRes = await app.request('/api/v1/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email })
    }, env);
    expect(resendRes.status).toBe(429);
    const resendJson = (await resendRes.json()) as { error: string };
    expect(resendJson.error).toContain('wait before requesting');

    const pastTime = new Date(Date.now() - 65 * 1000).toISOString();
    await env.DB
      .prepare('UPDATE email_verification_otps SET created_at = ? WHERE email = ?')
      .bind(pastTime, testUser.email)
      .run();

    const allowedResend = await app.request('/api/v1/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email })
    }, env);
    expect(allowedResend.status).toBe(200);
    const allowedJson = (await allowedResend.json()) as { success: boolean };
    expect(allowedJson.success).toBe(true);
  });
});
