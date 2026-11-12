// Unit test suite for 3D user avatar provisioning, persistence, and HTTP endpoints

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

describe('Mochi Cloud API - 3D User Avatar Suite', () => {
  let env: MochiEnv;
  const secret = 'avatar-test-secret-key-32-bytes-minimum';
  let testUserId: string;
  let authToken: string;

  async function registerAndVerify(username: string, email: string) {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password: 'password123',
          displayName: username.toUpperCase()
        })
      },
      env
    );
    expect(regRes.status).toBe(201);

    const otp = await env.DB.prepare(
      'SELECT code FROM email_verification_otps WHERE email = ?'
    )
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
    expect(verifyRes.status).toBe(200);

    return (await verifyRes.json()) as {
      token: string;
      user: { id: string; username: string };
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

    const auth = await registerAndVerify('cybercreator', 'creator@mochi.test');
    testUserId = auth.user.id;
    authToken = auth.token;
  });

  describe('Avatar Database Service', () => {
    it('provisions a starter avatar with default colors and humanoid_v1 rig', async () => {
      const avatar = await provisionDefaultAvatar(env.DB, 'usr_new_test_1');
      expect(avatar.userId).toBe('usr_new_test_1');
      expect(avatar.modelType).toBe('humanoid_v1');
      expect(avatar.headColor).toBe(DEFAULT_STARTER_AVATAR.headColor);
      expect(avatar.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
      expect(avatar.leftArmColor).toBe(DEFAULT_STARTER_AVATAR.leftArmColor);
      expect(avatar.rightArmColor).toBe(DEFAULT_STARTER_AVATAR.rightArmColor);
      expect(avatar.leftLegColor).toBe(DEFAULT_STARTER_AVATAR.leftLegColor);
      expect(avatar.rightLegColor).toBe(DEFAULT_STARTER_AVATAR.rightLegColor);
    });

    it('is idempotent and preserves existing customized attributes', async () => {
      await provisionDefaultAvatar(env.DB, 'usr_custom_1');
      await updateAvatar(env.DB, 'usr_custom_1', { torsoColor: '#ff0055' });

      const secondCall = await provisionDefaultAvatar(env.DB, 'usr_custom_1');
      expect(secondCall.torsoColor).toBe('#ff0055');
    });

    it('fetches an avatar by user id or returns null if not present', async () => {
      const nonExistent = await getAvatarByUserId(env.DB, 'usr_ghost_404');
      expect(nonExistent).toBeNull();

      await provisionDefaultAvatar(env.DB, 'usr_found_1');
      const found = await getAvatarByUserId(env.DB, 'usr_found_1');
      expect(found).not.toBeNull();
      expect(found?.userId).toBe('usr_found_1');
    });

    it('updates specific colors and accessories while preserving other parts', async () => {
      const updated = await updateAvatar(env.DB, testUserId, {
        headColor: '#ffffff',
        torsoColor: '#10b981',
        hatId: 'hat_cyber_beanie',
        shirtId: 'shirt_space_cadet'
      });

      expect(updated.headColor).toBe('#ffffff');
      expect(updated.torsoColor).toBe('#10b981');
      expect(updated.leftArmColor).toBe(DEFAULT_STARTER_AVATAR.leftArmColor);
      expect(updated.hatId).toBe('hat_cyber_beanie');
      expect(updated.shirtId).toBe('shirt_space_cadet');
    });

    it('ignores invalid hex color strings and preserves previous values', async () => {
      const original = await getAvatarByUserId(env.DB, testUserId);
      const updated = await updateAvatar(env.DB, testUserId, {
        headColor: 'not-a-valid-hex'
      });
      expect(updated.headColor).toBe(original?.headColor);
    });
  });

  describe('Avatar HTTP Endpoints', () => {
    it('rejects GET /api/v1/avatars/me without authorization token', async () => {
      const res = await app.request('/api/v1/avatars/me', { method: 'GET' }, env);
      expect(res.status).toBe(401);
    });

    it('returns current user avatar on GET /api/v1/avatars/me with valid Bearer token', async () => {
      const res = await app.request(
        '/api/v1/avatars/me',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` }
        },
        env
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; avatar: { userId: string } };
      expect(json.success).toBe(true);
      expect(json.avatar.userId).toBe(testUserId);
    });

    it('rejects PUT /api/v1/avatars/me when color format is malformed', async () => {
      const res = await app.request(
        '/api/v1/avatars/me',
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ torsoColor: 'bad_color_format' })
        },
        env
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Invalid color format');
    });

    it('updates customizable avatar on PUT /api/v1/avatars/me with valid colors', async () => {
      const res = await app.request(
        '/api/v1/avatars/me',
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            headColor: '#e0e7ff',
            torsoColor: '#4f46e5',
            leftArmColor: '#e0e7ff',
            rightArmColor: '#e0e7ff'
          })
        },
        env
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        success: boolean;
        avatar: { headColor: string; torsoColor: string };
      };
      expect(json.success).toBe(true);
      expect(json.avatar.headColor).toBe('#e0e7ff');
      expect(json.avatar.torsoColor).toBe('#4f46e5');
    });

    it('returns public avatar on GET /api/v1/avatars/:userId', async () => {
      const res = await app.request(`/api/v1/avatars/${testUserId}`, { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; avatar: { userId: string } };
      expect(json.success).toBe(true);
      expect(json.avatar.userId).toBe(testUserId);
    });

    it('returns 404 on GET /api/v1/avatars/:userId for unknown user', async () => {
      const res = await app.request('/api/v1/avatars/usr_non_existent', { method: 'GET' }, env);
      expect(res.status).toBe(404);
    });
  });

  describe('Registration Starter Avatar Integration', () => {
    it('automatically provisions starter avatar upon user registration', async () => {
      const newUser = await registerAndVerify('newrobloxian', 'robloxian@mochi.test');
      const avatarRes = await app.request(
        '/api/v1/avatars/me',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${newUser.token}` }
        },
        env
      );
      expect(avatarRes.status).toBe(200);
      const json = (await avatarRes.json()) as {
        success: boolean;
        avatar: { userId: string; modelType: string; torsoColor: string };
      };
      expect(json.avatar.userId).toBe(newUser.user.id);
      expect(json.avatar.modelType).toBe('humanoid_v1');
      expect(json.avatar.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
    });
  });
});
