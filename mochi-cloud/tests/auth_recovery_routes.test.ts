// Integration tests for Authentication Recovery, Email Login, and Gameplay routes

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

describe('Auth Recovery & Gameplay Routes', () => {
  let env: MochiEnv;
  let userToken: string;

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };

    // Register and verify test user
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'playerone',
          email: 'player@game.lenout.com',
          password: 'Password123!',
          displayName: 'Player One'
        })
      },
      env
    );

    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind('player@game.lenout.com').first<{ code: string }>();

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'player@game.lenout.com', code: otp!.code })
    }, env);

    const json = (await verifyRes.json()) as { token: string };
    userToken = json.token;
  });

  it('handles forgot-password and reset-password with OTP validation', async () => {
    // 1. Request forgot password code
    const forgotRes = await app.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'player@game.lenout.com' })
    }, env);
    expect(forgotRes.status).toBe(200);

    const resetOtp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ? ORDER BY expires_at DESC')
      .bind('player@game.lenout.com').first<{ code: string }>();
    expect(resetOtp).toBeTruthy();

    // 2. Reject reset with bad code
    const badReset = await app.request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'player@game.lenout.com',
        code: '000000',
        newPassword: 'BrandNewPassword2026!'
      })
    }, env);
    expect(badReset.status).toBe(400);

    // 3. Accept reset with valid code
    const goodReset = await app.request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'player@game.lenout.com',
        code: resetOtp!.code,
        newPassword: 'BrandNewPassword2026!'
      })
    }, env);
    expect(goodReset.status).toBe(200);
    const resetJson = (await goodReset.json()) as { token: string; user: { email: string } };
    expect(resetJson.token).toBeTruthy();
    expect(resetJson.user.email).toBe('player@game.lenout.com');
  });

  it('supports passwordless email-code login dispatch and verification', async () => {
    // 1. Dispatch email login code
    const dispatchRes = await app.request('/api/v1/auth/email-code-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'player@game.lenout.com' })
    }, env);
    expect(dispatchRes.status).toBe(200);

    const loginOtp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ? ORDER BY expires_at DESC')
      .bind('player@game.lenout.com').first<{ code: string }>();
    expect(loginOtp).toBeTruthy();

    // 2. Verify login code
    const loginRes = await app.request('/api/v1/auth/verify-login-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'player@game.lenout.com',
        code: loginOtp!.code
      })
    }, env);
    expect(loginRes.status).toBe(200);
    const loginJson = (await loginRes.json()) as { token: string; user: { email: string } };
    expect(loginJson.token).toBeTruthy();
  });

  it('increments play count via POST /api/v1/games/:id/play and adds coins', async () => {
    // 1. Create a game
    const createRes = await app.request('/api/v1/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ title: 'Sky Race Obby', slug: 'sky-race-obby' })
    }, env);
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { game: { id: string } };

    // 2. Play game
    const playRes = await app.request(`/api/v1/games/${created.game.id}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, env);
    expect(playRes.status).toBe(200);
    const playJson = (await playRes.json()) as { playCount: number };
    expect(playJson.playCount).toBe(1);

    // 3. Add coins to authenticated player
    const coinRes = await app.request('/api/v1/auth/coins/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ amount: 25 })
    }, env);
    expect(coinRes.status).toBe(200);
    const coinJson = (await coinRes.json()) as { coins: number };
    expect(coinJson.coins).toBeGreaterThanOrEqual(25);
  });
});
