// Adversarial verification test suite for Milestone 1 3D Avatar API and Persistence
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { signToken } from '../src/middleware/auth';
import { provisionDefaultAvatar, getAvatarByUserId } from '../src/services/avatarDb';
import { DEFAULT_STARTER_AVATAR, isValidHexColor } from '../src/models/avatar';

describe('Milestone 1 Adversarial Challenge: 3D Avatar & Persistence', () => {
  let env: MochiEnv;
  const testSecret = 'challenger-avatar-m1-test-secret-key-32';
  let testUserId: string;
  let testToken: string;

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: { put: async () => ({}) as R2Object, get: async () => null, delete: async () => {}, head: async () => null } as unknown as R2Bucket,
      GAME_ROOM: { idFromName: () => ({} as DurableObjectId), get: () => ({ fetch: async () => new Response(null, { status: 101 }) } as unknown as DurableObjectStub) } as unknown as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: testSecret
    };

    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'avatar_challenger', email: 'challenger@lenout.com', password: 'Password123!', displayName: 'Challenger' })
    }, env);
    expect(regRes.status).toBe(201);
    const regData = (await regRes.json()) as { userId: string; email: string };
    testUserId = regData.userId;

    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?').bind(regData.email).first<{ code: string }>();
    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regData.email, code: otp!.code })
    }, env);
    expect(verifyRes.status).toBe(200);
    testToken = ((await verifyRes.json()) as { token: string }).token;
  });

  describe('Challenge 1: Concurrency and Idempotent Provisioning', () => {
    it('handles concurrent burst provisioning for the same user without duplication or crash', async () => {
      const results = await Promise.all(Array.from({ length: 25 }, () => provisionDefaultAvatar(env.DB, testUserId)));
      expect(results).toHaveLength(25);
      for (const res of results) {
        expect(res.userId).toBe(testUserId);
        expect(res.modelType).toBe('humanoid_v1');
        expect(res.headColor).toBe(DEFAULT_STARTER_AVATAR.headColor);
        expect(res.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
      }
      const persisted = await getAvatarByUserId(env.DB, testUserId);
      expect(persisted?.userId).toBe(testUserId);
    });
  });

  describe('Challenge 2: Hex Color Injection and Malicious Fuzzing', () => {
    it('rejects malformed hex color formats across all color attributes', async () => {
      const invalidColors = ['#', '#12', '#1234', '#12345', '#1234567', '#12345678', '#gggggg', 'red', 'rgb(255,0,0)', '<script>alert(1)</script>', "' OR '1'='1", '#0284c7; DROP TABLE users;', '#0284c7\x00#ffffff'];
      for (const badColor of invalidColors) {
        expect(isValidHexColor(badColor)).toBe(false);
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` },
          body: JSON.stringify({ torsoColor: badColor })
        }, env);
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain('Invalid color format');
      }
    });

    it('accepts both 3-digit and 6-digit valid hex colors', async () => {
      const validCases = [
        { key: 'headColor', val: '#fff' },
        { key: 'torsoColor', val: '#000' },
        { key: 'leftArmColor', val: '#123456' },
        { key: 'rightArmColor', val: '#ABCDEF' },
        { key: 'leftLegColor', val: '#abcdef' },
        { key: 'rightLegColor', val: '#0284c7' }
      ];
      for (const item of validCases) {
        expect(isValidHexColor(item.val)).toBe(true);
        const res = await app.request('/api/v1/avatars/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` },
          body: JSON.stringify({ [item.key]: item.val })
        }, env);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; avatar: Record<string, string> };
        expect(body.success).toBe(true);
        expect(body.avatar[item.key]).toBe(item.val);
      }
    });
  });

  describe('Challenge 3: Payload Tamper and Field Injection Defense', () => {
    it('prevents overwriting userId or injecting privileged fields during avatar update', async () => {
      const victimId = 'usr_victim_innocent_000';
      const res = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` },
        body: JSON.stringify({ userId: victimId, role: 'admin', coins: 999999, headColor: '#112233' })
      }, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; avatar: { userId: string; headColor: string } };
      expect(data.success).toBe(true);
      expect(data.avatar.userId).toBe(testUserId);
      expect(data.avatar.headColor).toBe('#112233');
      expect(await getAvatarByUserId(env.DB, victimId)).toBeNull();
    });

    it('gracefully handles empty update payload without modifying attributes', async () => {
      const res = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` },
        body: JSON.stringify({})
      }, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; avatar: { headColor: string; torsoColor: string } };
      expect(data.success).toBe(true);
      expect(data.avatar.headColor).toBe(DEFAULT_STARTER_AVATAR.headColor);
      expect(data.avatar.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
    });
  });

  describe('Challenge 4: Authentication Guards and Token Validation', () => {
    it('rejects unauthenticated requests to GET /me and PUT /me with 401', async () => {
      expect((await app.request('/api/v1/avatars/me', { method: 'GET' }, env)).status).toBe(401);
      const putRes = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headColor: '#000000' })
      }, env);
      expect(putRes.status).toBe(401);
    });

    it('rejects tampered or forged JWT tokens with 401', async () => {
      const fakeToken = await signToken({ userId: testUserId, username: 'fake', role: 'admin' }, 'wrong-secret-key-32-bytes-fake');
      const res = await app.request('/api/v1/avatars/me', { method: 'GET', headers: { Authorization: `Bearer ${fakeToken}` } }, env);
      expect(res.status).toBe(401);
    });
  });

  describe('Challenge 5: Public Lookup and Nonexistent User Boundaries', () => {
    it('returns 404 when querying an avatar for a nonexistent user ID', async () => {
      const res = await app.request('/api/v1/avatars/usr_nonexistent_ghost_999', { method: 'GET' }, env);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toContain('Avatar not found');
    });

    it('safely handles SQL injection attempts in userId route parameter', async () => {
      const res = await app.request(`/api/v1/avatars/${encodeURIComponent("usr_test' OR '1'='1' --")}`, { method: 'GET' }, env);
      expect(res.status).toBe(404);
    });

    it('returns 200 with avatar for a valid user via public endpoint', async () => {
      const res = await app.request(`/api/v1/avatars/${testUserId}`, { method: 'GET' }, env);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { success: boolean; avatar: { userId: string } }).avatar.userId).toBe(testUserId);
    });
  });

  describe('Challenge 6: Starter Avatar Specification and Registration Parity', () => {
    it('strictly satisfies the starter avatar specification in PROJECT.md', () => {
      expect(DEFAULT_STARTER_AVATAR.modelType).toBe('humanoid_v1');
      expect(DEFAULT_STARTER_AVATAR.headColor).toBe('#fcd34d');
      expect(DEFAULT_STARTER_AVATAR.torsoColor).toBe('#0284c7');
      expect(DEFAULT_STARTER_AVATAR.leftArmColor).toBe('#fcd34d');
      expect(DEFAULT_STARTER_AVATAR.rightArmColor).toBe('#fcd34d');
      expect(DEFAULT_STARTER_AVATAR.leftLegColor).toBe('#1e293b');
      expect(DEFAULT_STARTER_AVATAR.rightLegColor).toBe('#1e293b');
    });

    it('automatically provisioned starter avatar on registration matches default palette', async () => {
      const res = await app.request('/api/v1/avatars/me', { method: 'GET', headers: { Authorization: `Bearer ${testToken}` } }, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; avatar: Record<string, string> };
      expect(data.success).toBe(true);
      expect(data.avatar.userId).toBe(testUserId);
      expect(data.avatar.modelType).toBe('humanoid_v1');
      expect(data.avatar.headColor).toBe('#fcd34d');
      expect(data.avatar.torsoColor).toBe('#0284c7');
      expect(data.avatar.leftArmColor).toBe('#fcd34d');
      expect(data.avatar.rightArmColor).toBe('#fcd34d');
      expect(data.avatar.leftLegColor).toBe('#1e293b');
      expect(data.avatar.rightLegColor).toBe('#1e293b');
    });
  });
});
