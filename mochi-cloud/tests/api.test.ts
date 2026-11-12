import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

describe('Mochi Cloud API - Health, CORS & Infrastructure', () => {
  let env: MochiEnv;

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
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173,https://playmochi.com',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
  });

  describe('Health Route', () => {
    it('returns 200 OK and service metadata', async () => {
      const res = await app.request('/api/v1/health', { method: 'GET' }, env);
      expect(res.status).toBe(200);

      const json = (await res.json()) as Record<string, unknown>;
      expect(json.status).toBe('ok');
      expect(json.service).toBe('mochi-cloud');
      expect(json.version).toBe('0.1.0');
      expect(typeof json.timestamp).toBe('string');
    });
  });

  describe('Parameterized Dynamic CORS Middleware', () => {
    it('handles OPTIONS preflight for allowed origin', async () => {
      const res = await app.request(
        '/api/v1/health',
        {
          method: 'OPTIONS',
          headers: { Origin: 'https://game.lenout.com' }
        },
        env
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://game.lenout.com'
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('handles custom domain from parameterized ALLOWED_ORIGINS', async () => {
      const res = await app.request(
        '/api/v1/health',
        {
          method: 'GET',
          headers: { Origin: 'https://playmochi.com' }
        },
        env
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://playmochi.com'
      );
    });
  });

  describe('Asset Upload Route', () => {
    it('generates an upload URL for bundle zip files', async () => {
      await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'uploader',
            email: 'uploader@mochi.dev',
            password: 'secretpassword'
          })
        },
        env
      );
      const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
        .bind('uploader@mochi.dev').first<{ code: string }>();
      const verifyRes = await app.request('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'uploader@mochi.dev', code: otp!.code })
      }, env);
      const { token } = (await verifyRes.json()) as { token: string };

      const res = await app.request(
        '/api/v1/assets/upload-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            filename: 'game-bundle.zip',
            contentType: 'application/zip',
            sizeBytes: 1048576
          })
        },
        env
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        uploadUrl: string;
        publicUrl: string;
        assetKey: string;
      };
      expect(json.uploadUrl).toContain('/api/v1/assets/upload?key=');
      expect(json.publicUrl).toContain(
        'https://assets-game.lenout.com/bundles/'
      );
      expect(json.assetKey).toContain('bundles/');
    });
  });

  describe('Global Fallback and Error Handlers', () => {
    it('returns 404 for unknown endpoints', async () => {
      const res = await app.request('/api/v1/nonexistent', { method: 'GET' }, env);
      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Not Found');
    });
  });
});
