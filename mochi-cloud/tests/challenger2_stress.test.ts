import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { signToken } from '../src/middleware/auth';

describe('Challenger Replacement Empirical Stress Harness - M2', () => {
  let env: MochiEnv;
  const testSecret = 'challenger-replacement-secret-key-32';

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {
        put: async () => ({}) as R2Object,
        get: async () => null,
        delete: async () => {},
        head: async () => null
      } as unknown as R2Bucket,
      GAME_ROOM: {
        idFromName: () => ({} as DurableObjectId),
        get: () => ({
          fetch: async () => new Response(null, { status: 101 })
        } as unknown as DurableObjectStub)
      } as unknown as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: testSecret
    };
  });

  describe('Adversarial Test 1: Cross-Creator Ownership Isolation', () => {
    it('blocks Creator B from publishing versions of Creator A game', async () => {
      // 1. Register Creator A
      const regResA = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'creatorA',
          email: 'creatorA@mochi.test',
          password: 'passwordA123'
        })
      }, env);
      expect(regResA.status).toBe(201);
      const otpA = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
        .bind('creatorA@mochi.test').first<{ code: string }>();
      const vResA = await app.request('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'creatorA@mochi.test', code: otpA!.code })
      }, env);
      const dataA = (await vResA.json()) as { token: string };

      // 2. Register Creator B
      const regResB = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'creatorB',
          email: 'creatorB@mochi.test',
          password: 'passwordB123'
        })
      }, env);
      expect(regResB.status).toBe(201);
      const otpB = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
        .bind('creatorB@mochi.test').first<{ code: string }>();
      const vResB = await app.request('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'creatorB@mochi.test', code: otpB!.code })
      }, env);
      const dataB = (await vResB.json()) as { token: string };

      // 3. Creator A creates a game
      const createGameRes = await app.request('/api/v1/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dataA.token}`
        },
        body: JSON.stringify({
          title: 'Creator A Masterpiece',
          description: 'Top secret game'
        })
      }, env);
      expect(createGameRes.status).toBe(201);
      const gameData = await createGameRes.json() as { game: { id: string } };

      // 4. Creator B attempts to publish a new version for Creator A game -> MUST return 403 Forbidden
      const unauthorizedPublish = await app.request(`/api/v1/games/${gameData.game.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dataB.token}`
        },
        body: JSON.stringify({
          versionNumber: '1.0.0',
          bundleUrl: 'https://assets-game.lenout.com/bundles/hack.zip',
          manifestJson: JSON.stringify({ title: 'Hacked Version' })
        })
      }, env);

      expect(unauthorizedPublish.status).toBe(403);
      const err = await unauthorizedPublish.json() as { error: string };
      expect(err.error).toContain('Forbidden');
    });
  });

  describe('Adversarial Test 2: SQL Injection and Search Sanitization', () => {
    it('handles SQL injection payloads in search query safely', async () => {
      const sqlInjections = [
        "' OR '1'='1",
        "'; DROP TABLE games; --",
        "') UNION SELECT * FROM users --",
        "1' OR 1=1 /*"
      ];

      for (const injection of sqlInjections) {
        const res = await app.request(`/api/v1/games?search=${encodeURIComponent(injection)}`, {}, env);
        expect(res.status).toBe(200);
        const data = await res.json() as { games: unknown[]; total: number };
        expect(Array.isArray(data.games)).toBe(true);
      }
    });
  });

  describe('Adversarial Test 3: Manifest JSON Syntax Boundaries', () => {
    it('rejects unparseable manifestJson with 400', async () => {
      const creatorToken = await signToken({ id: 'creator-99', role: 'creator' }, testSecret, 3600);

      // Register creator and create game first
      const createRes = await app.request('/api/v1/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creatorToken}`
        },
        body: JSON.stringify({ title: 'JSON Validation Game' })
      }, env);
      const gameData = await createRes.json() as { game: { id: string } };

      const malformedPayloads = [
        '{ title: unquoted }',
        'undefined',
        '<xml>not json</xml>',
        '{"unclosed": "string'
      ];

      for (const badJson of malformedPayloads) {
        const res = await app.request(`/api/v1/games/${gameData.game.id}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${creatorToken}`
          },
          body: JSON.stringify({
            versionNumber: '1.0.0',
            bundleUrl: 'https://cdn.example.com/b.zip',
            manifestJson: badJson
          })
        }, env);

        expect(res.status).toBe(400);
        const err = await res.json() as { error: string };
        expect(err.error).toContain('manifestJson must be valid JSON');
      }
    });
  });

  describe('Adversarial Test 4: Slug Generation and Collision Mitigation', () => {
    it('generates unique slugs when two games share identical titles', async () => {
      const token = await signToken({ id: 'creator-slug-tester', role: 'creator' }, testSecret, 3600);

      const res1 = await app.request('/api/v1/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Super Mario Clone' })
      }, env);
      expect(res1.status).toBe(201);
      const game1 = await res1.json() as { game: { slug: string } };
      expect(game1.game.slug).toBe('super-mario-clone');

      const res2 = await app.request('/api/v1/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Super Mario Clone' })
      }, env);
      expect(res2.status).toBe(201);
      const game2 = await res2.json() as { game: { slug: string } };
      expect(game2.game.slug).not.toBe(game1.game.slug);
      expect(game2.game.slug.startsWith('super-mario-clone-')).toBe(true);
    });
  });

  describe('Adversarial Test 5: Asset Upload Endpoint Protections', () => {
    it('rejects asset upload with missing key', async () => {
      const res = await app.request('/api/v1/assets/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: 'binary-data-test'
      }, env);
      expect(res.status).toBe(400);
      const err = await res.json() as { error: string };
      expect(err.error).toContain('Asset key query parameter is required');
    });

    it('rejects asset upload when R2 ASSETS binding is missing', async () => {
      const brokenEnv = { ...env, ASSETS: undefined as unknown as R2Bucket };
      const res = await app.request('/api/v1/assets/upload?key=test-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: 'binary-data-test'
      }, brokenEnv);
      expect(res.status).toBe(503);
      const err = await res.json() as { error: string };
      expect(err.error).toContain('R2 storage bucket is not configured');
    });
  });
});
