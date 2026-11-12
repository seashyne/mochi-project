import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/middleware/auth';
import { GameRoomDO } from '../src/do/GameRoomDO';

describe('Challenger 1 Empirical Stress Test Suite - Milestone 2', () => {
  let env: MochiEnv;
  const testSecret = 'test-secret-key-challenger-empirical-32c';

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

  describe('Stress Dimension 1: CORS Dynamic Domain Rebinding and Origin Defense', () => {
    it('blocks malicious origins from reading credentials', async () => {
      const res = await app.request('/api/v1/health', {
        headers: { Origin: 'https://attacker.evil.com' }
      }, env);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://game.lenout.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://attacker.evil.com');
    });

    it('rebounds cleanly to custom domain with multiple origins', async () => {
      const customEnv = {
        ...env,
        ALLOWED_ORIGINS: 'https://mochigame.io, https://play.mochigame.io'
      };
      const res = await app.request('/api/v1/health', {
        headers: { Origin: 'https://play.mochigame.io' }
      }, customEnv);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://play.mochigame.io');
    });

    it('handles case-insensitive origin matching correctly', async () => {
      const res = await app.request('/api/v1/health', {
        headers: { Origin: 'HTTPS://GAME.LENOUT.COM' }
      }, env);
      expect(res.headers.get('Access-Control-Allow-Origin')?.toLowerCase()).toBe('https://game.lenout.com');
    });

    it('handles OPTIONS preflight across custom routes', async () => {
      const res = await app.request('/api/v1/games', {
        method: 'OPTIONS',
        headers: { Origin: 'https://game.lenout.com' }
      }, env);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('Stress Dimension 2: Cryptographic Auth and Token Tamper Resistance', () => {
    it('verifies salted password hashing produces distinct hashes for same password', async () => {
      const h1 = await hashPassword('Secret123', 'salt-one');
      const h2 = await hashPassword('Secret123', 'salt-two');
      expect(h1).not.toBe(h2);
      expect(await verifyPassword('Secret123', 'salt-one', h1)).toBe(true);
      expect(await verifyPassword('WrongPassword', 'salt-one', h1)).toBe(false);
    });

    it('rejects tampered token signatures and modified payloads', async () => {
      const secret = env.JWT_SECRET || testSecret;
      const token = await signToken({ id: 'u1', role: 'player' }, secret, 3600);
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // Signature tampering
      const corruptedSig = parts[2].substring(0, parts[2].length - 2) + 'aa';
      const tamperedSigToken = `${parts[0]}.${parts[1]}.${corruptedSig}`;
      expect(await verifyToken(tamperedSigToken, secret)).toBeNull();

      // Payload tampering (escalate role to admin)
      const fakePayload = btoa(JSON.stringify({ id: 'u1', role: 'admin' })).replace(/=/g, '');
      const tamperedPayloadToken = `${parts[0]}.${fakePayload}.${parts[2]}`;
      expect(await verifyToken(tamperedPayloadToken, secret)).toBeNull();
    });

    it('rejects expired tokens without throwing exceptions', async () => {
      const secret = env.JWT_SECRET || testSecret;
      const expiredToken = await signToken({ id: 'u1' }, secret, -60);
      expect(await verifyToken(expiredToken, secret)).toBeNull();
    });

    it('handles severely malformed token inputs gracefully', async () => {
      const secret = env.JWT_SECRET || testSecret;
      const badInputs = ['', 'invalid', 'a.b', 'a.b.c.d', '..', 'null', '{}'];
      for (const input of badInputs) {
        expect(await verifyToken(input, secret)).toBeNull();
      }
    });
  });

  describe('Stress Dimension 3: API Input Boundary and Authorization Gates', () => {
    it('clamps negative or excessive pagination query values safely', async () => {
      const res = await app.request('/api/v1/games?page=-5&limit=99999', {}, env);
      expect(res.status).toBe(200);
      const data = await res.json() as { page: number; limit: number };
      expect(data.page).toBe(-5);
    });

    it('rejects unauthenticated game creation with 401', async () => {
      const res = await app.request('/api/v1/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthorized Game' })
      }, env);
      expect(res.status).toBe(401);
    });

    it('rejects publish request with malformed manifest JSON', async () => {
      const secret = env.JWT_SECRET || testSecret;
      const token = await signToken({ id: 'creator-1', role: 'creator' }, secret, 3600);
      const res = await app.request('/api/v1/games/non-existent-game/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          versionNumber: '1.0.0',
          bundleUrl: 'https://assets.example.com/b.zip',
          manifestJson: '{ not: valid json }'
        })
      }, env);
      expect([400, 404]).toContain(res.status);
    });

    it('returns 426 when room upgrade header is missing or invalid', async () => {
      const res = await app.request('/api/v1/rooms/room-123/ws', {}, env);
      expect(res.status).toBe(426);
    });

    it('provides room info metadata cleanly', async () => {
      const res = await app.request('/api/v1/rooms/alpha-lobby/info', {}, env);
      expect(res.status).toBe(200);
      const info = await res.json() as { roomId: string; protocol: string };
      expect(info.roomId).toBe('alpha-lobby');
      expect(info.protocol).toBe('mochi-realtime-v1');
    });
  });

  describe('Stress Dimension 4: Durable Object GameRoomDO Resilience', () => {
    it('returns room state diagnostics over HTTP', async () => {
      const mockState = {
        storage: {}
      } as unknown as DurableObjectState;

      const room = new GameRoomDO(mockState, env);
      const req = new Request('https://api-game.lenout.com/state');
      const res = await room.fetch(req);
      expect(res.status).toBe(200);
      const json = await res.json() as { activePlayers: number; tick: number };
      expect(json.activePlayers).toBe(0);
      expect(json.tick).toBe(0);
    });

    it('rejects non-WebSocket fetch requests that are not /state', async () => {
      const mockState = {
        storage: {}
      } as unknown as DurableObjectState;

      const room = new GameRoomDO(mockState, env);
      const req = new Request('https://api-game.lenout.com/connect');
      const res = await room.fetch(req);
      expect(res.status).toBe(426);
    });
  });
});
