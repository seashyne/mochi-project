// Direct CDN Subdomain Edge Serving for 3D Models and Assets
// Validates models-game.lenout.com and assets-game.lenout.com hostname routing

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { MochiEnv } from '../src/types/env';
import { createMockDb } from './mockDb';
import { isCdnHostname } from '../src/services/cdnServe';
import { signToken } from '../src/middleware/auth';

const GLB_CONTENT = 'glTF-binary-mock-stream-data';

function makeCdnEnv(): MochiEnv {
  return {
    DB: createMockDb(),
    ASSETS: {
      head: async (key: string) => {
        if (key.includes('not-found')) return null;
        return { key, size: GLB_CONTENT.length };
      },
      get: async (_key: string, options?: { range?: { offset: number; length: number } }) => {
        const offset = options?.range?.offset ?? 0;
        const length = options?.range?.length ?? GLB_CONTENT.length;
        const slice = GLB_CONTENT.slice(offset, offset + length);
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(slice));
              controller.close();
            }
          }),
          size: length,
          etag: 'glb-etag-1',
          httpEtag: '"glb-etag-1"',
          httpMetadata: {
            contentType: 'model/gltf-binary',
            cacheControl: 'public, max-age=31536000, immutable'
          }
        };
      }
    } as unknown as R2Bucket,
    GAME_ROOM: {} as DurableObjectNamespace,
    STUDIO_DRAFT: {} as DurableObjectNamespace,
    ALLOWED_ORIGINS: 'https://game.lenout.com,https://studio-game.lenout.com',
    API_HOSTNAME: 'api-game.lenout.com',
    PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
    PUBLIC_MODELS_URL: 'https://models-game.lenout.com',
    JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
  };
}

describe('CDN Models and Assets Subdomain Routing', () => {
  let env: MochiEnv;

  beforeEach(() => {
    env = makeCdnEnv();
  });

  it('recognizes CDN hostnames accurately', () => {
    expect(isCdnHostname('assets.lenout.com')).toBe(true);
    expect(isCdnHostname('cdn.lenout.com')).toBe(true);
    expect(isCdnHostname('models-game.lenout.com')).toBe(true);
    expect(isCdnHostname('assets-game.lenout.com')).toBe(true);
    expect(isCdnHostname('api.lenout.com')).toBe(false);
    expect(isCdnHostname('studio.lenout.com')).toBe(false);
    expect(isCdnHostname('api-game.lenout.com')).toBe(false);
    expect(isCdnHostname('game.lenout.com')).toBe(false);
    expect(isCdnHostname('studio-game.lenout.com')).toBe(false);
  });

  it('serves root informational probe on assets.lenout.com', async () => {
    const res = await app.request(
      'https://assets.lenout.com/',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('online');
    expect(data.bucket).toBe('mochi-assets');
  });

  it('serves root informational probe on models-game.lenout.com', async () => {
    const res = await app.request(
      'https://models-game.lenout.com/',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('online');
    expect(data.service).toBe('mochi-models-storage');
    expect(data.bucket).toBe('mochi-assets');
  });

  it('serves root informational probe on assets-game.lenout.com', async () => {
    const res = await app.request(
      'https://assets-game.lenout.com/',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('online');
    expect(data.service).toBe('mochi-assets-storage');
  });

  it('serves 3D GLB model with model/gltf-binary and CORS', async () => {
    const res = await app.request(
      'https://models-game.lenout.com/models/trees/oak.glb',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  it('supports Range partial content requests for progressive 3D streaming', async () => {
    const res = await app.request(
      'https://models-game.lenout.com/models/trees/oak.glb',
      {
        method: 'GET',
        headers: { Range: 'bytes=0-9' }
      },
      env
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-9/${GLB_CONTENT.length}`);
    expect(res.headers.get('Content-Length')).toBe('10');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles OPTIONS preflight on CDN domains', async () => {
    const res = await app.request(
      'https://models-game.lenout.com/models/trees/oak.glb',
      { method: 'OPTIONS' },
      env
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('returns 404 for missing objects on CDN domain', async () => {
    const res = await app.request(
      'https://models-game.lenout.com/not-found.glb',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(404);
  });

  it('rejects access to private drafts without a valid token (Mode 2)', async () => {
    const res = await app.request(
      'https://assets-game.lenout.com/drafts/usr_01/map_draft.glb',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, string>;
    expect(body.error).toBe('Forbidden');
  });

  it('allows access to private drafts with a valid signed token (Mode 2)', async () => {
    const validToken = await signToken(
      { sub: 'usr_01', path: 'drafts/usr_01/map_draft.glb' },
      env.JWT_SECRET || 'test-secret-key-32-bytes-minimum-length',
      7200
    );
    const res = await app.request(
      `https://assets-game.lenout.com/drafts/usr_01/map_draft.glb?token=${validToken}`,
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
