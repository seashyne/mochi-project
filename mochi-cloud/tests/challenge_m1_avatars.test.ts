// Adversarial Empirical Challenge Suite 1 - Milestone 1 Avatar Endpoints and D1 Operations
// Stress tests concurrency, boundary inputs, malformed hex colors, injection, and idempotency

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import {
  provisionDefaultAvatar,
  getAvatarByUserId,
  updateAvatar
} from '../src/services/avatarDb';
import { DEFAULT_STARTER_AVATAR } from '../src/models/avatar';

describe('Adversarial M1: Avatar Concurrency, Boundary Inputs, and Idempotency', () => {
  let env: MochiEnv;
  const secret = 'avatar-challenger-secret-32-bytes-min';
  let testUserId: string;
  let authToken: string;

  async function registerAndVerify(username: string, email: string) {
    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: 'password123', displayName: username.toUpperCase() })
    }, env);
    expect(regRes.status).toBe(201);

    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind(email).first<{ code: string }>();

    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp!.code })
    }, env);
    expect(verifyRes.status).toBe(200);

    return (await verifyRes.json()) as { token: string; user: { id: string; username: string } };
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

    const auth = await registerAndVerify('stress_tester', 'tester@mochi.test');
    testUserId = auth.user.id;
    authToken = auth.token;
  });

  describe('Dimension 1: Provisioning Concurrency and Idempotency', () => {
    it('handles 25 concurrent calls to provisionDefaultAvatar without corruption', async () => {
      const targetUser = 'usr_concurrent_stress_1';
      const promises = Array.from({ length: 25 }, () => provisionDefaultAvatar(env.DB, targetUser));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(25);
      const first = results[0];
      for (const res of results) {
        expect(res.userId).toBe(targetUser);
        expect(res.modelType).toBe('humanoid_v1');
        expect(res.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
        expect(res.headColor).toBe(first.headColor);
      }
    });

    it('preserves customized colors when multiple concurrent provisions hit existing avatar', async () => {
      const customUser = 'usr_custom_avatar_99';
      await provisionDefaultAvatar(env.DB, customUser);
      await updateAvatar(env.DB, customUser, { headColor: '#123456', torsoColor: '#abcdef' });

      const concurrentCalls = Array.from({ length: 15 }, () => provisionDefaultAvatar(env.DB, customUser));
      const results = await Promise.all(concurrentCalls);

      for (const res of results) {
        expect(res.headColor).toBe('#123456');
        expect(res.torsoColor).toBe('#abcdef');
      }
    });

    it('provisions distinct default avatars for high-volume sequential users', async () => {
      for (let i = 0; i < 40; i++) {
        const uid = `usr_seq_vol_${i}`;
        const avatar = await provisionDefaultAvatar(env.DB, uid);
        expect(avatar.userId).toBe(uid);
      }
      const fetched = await getAvatarByUserId(env.DB, 'usr_seq_vol_39');
      expect(fetched?.userId).toBe('usr_seq_vol_39');
    });
  });

  describe('Dimension 2: Boundary Inputs and Malformed Hex Color Handling', () => {
    it('rejects SQL injection attempts in color fields with 400 Bad Request', async () => {
      const injections = [
        "#000000'; DROP TABLE user_avatars; --",
        "' OR '1'='1",
        '#0284c7 UNION SELECT * FROM users',
        '#0284c7; DELETE FROM users;'
      ];

      for (const injection of injections) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ torsoColor: injection })
        }, env);
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string };
        expect(json.error).toContain('Invalid color format');
      }
    });

    it('rejects CSS named colors and CSS functional notation with 400', async () => {
      const cssColors = ['red', 'blue', 'transparent', 'rgb(255, 0, 0)', 'rgba(0, 0, 0, 0.5)', 'hsl(120, 100%, 50%)'];

      for (const color of cssColors) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ headColor: color })
        }, env);
        expect(res.status).toBe(400);
      }
    });

    it('rejects malformed hex formats (length mismatches, invalid characters)', async () => {
      const malformed = [
        '0284c7', '#12', '#1234', '#12345', '#1234567', '#12345678',
        '#gggggg', '#zzzzzz', '#', '', '   ', '#' + 'f'.repeat(500)
      ];

      for (const badHex of malformed) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ torsoColor: badHex })
        }, env);
        expect(res.status).toBe(400);
      }
    });

    it('accepts valid 3-digit and 6-digit hex formats in various casings', async () => {
      const validCases = [
        { headColor: '#fff', torsoColor: '#000' },
        { headColor: '#ABC', torsoColor: '#123' },
        { headColor: '#0284C7', torsoColor: '#FCD34D' },
        { headColor: '#1e293b', torsoColor: '#e0e7ff' }
      ];

      for (const valid of validCases) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(valid)
        }, env);
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; avatar: typeof valid };
        expect(json.success).toBe(true);
        expect(json.avatar.headColor).toBe(valid.headColor);
        expect(json.avatar.torsoColor).toBe(valid.torsoColor);
      }
    });

    it('handles empty JSON body and preserves current avatar configuration', async () => {
      const res = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; avatar: { userId: string } };
      expect(json.success).toBe(true);
      expect(json.avatar.userId).toBe(testUserId);
    });

    it('prevents tampering with userId via PUT /api/v1/avatars/me', async () => {
      const res = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr_impersonated_victim', torsoColor: '#10b981' })
      }, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; avatar: { userId: string } };
      expect(json.avatar.userId).toBe(testUserId);
      expect(json.avatar.userId).not.toBe('usr_impersonated_victim');
    });
  });

  describe('Dimension 3: Public Avatar Lookup Boundary', () => {
    it('returns 404 on non-existent user id query', async () => {
      const res = await app.request('/api/v1/avatars/usr_does_not_exist_9999', { method: 'GET' }, env);
      expect(res.status).toBe(404);
    });

    it('auto-provisions and returns starter avatar for existing user without avatar record', async () => {
      const res = await app.request(`/api/v1/avatars/${testUserId}`, { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; avatar: { userId: string } };
      expect(json.success).toBe(true);
      expect(json.avatar.userId).toBe(testUserId);
    });
  });
});
