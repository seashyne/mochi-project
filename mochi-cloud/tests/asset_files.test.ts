// Range-aware asset serving and upload content-type restrictions

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { MochiEnv } from '../src/types/env';
import { createMockDb } from './mockDb';
import {
  isAllowedContentType,
  validateAssetRequest
} from '../src/services/assetPipeline';

const BODY = '0123456789';

function makeEnv(contentType = 'application/json'): MochiEnv {
  return {
    DB: createMockDb(),
    ASSETS: {
      head: async (key: string) => ({ key, size: BODY.length }),
      get: async () =>
        ({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(BODY));
              controller.close();
            }
          }),
          size: BODY.length,
          etag: 'etag-1',
          httpEtag: '"etag-1"',
          httpMetadata: {
            contentType,
            cacheControl: 'public, max-age=31536000, immutable'
          }
        })
    } as unknown as R2Bucket,
    GAME_ROOM: {} as DurableObjectNamespace,
    ALLOWED_ORIGINS: 'https://game.lenout.com',
    API_HOSTNAME: 'api-game.lenout.com',
    PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
    JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
  };
}

describe('asset file serving', () => {
  let env: MochiEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  it('serves whole objects with immutable caching', async () => {
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.text()).toBe(BODY);
  });

  it('refuses to let a browser sniff or render an upload as a document', async () => {
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET' },
      env
    );
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    // application/json is not something a browser should render as a page.
    expect(res.headers.get('Content-Disposition')).toBe('attachment');
  });

  it('serves audio inline so it can be decoded and played', async () => {
    const audioEnv = makeEnv('audio/mpeg');
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET' },
      audioEnv
    );
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Content-Disposition')).toBeNull();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('downloads an svg instead of serving it inline', async () => {
    const svgEnv = makeEnv('image/svg+xml');
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET' },
      svgEnv
    );
    expect(res.headers.get('Content-Disposition')).toBe('attachment');
  });

  it('serves byte ranges as 206 responses', async () => {
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET', headers: { Range: 'bytes=2-5' } },
      env
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res.headers.get('Content-Length')).toBe('4');
  });

  it('rejects unsatisfiable ranges with 416', async () => {
    const res = await app.request(
      '/api/v1/assets/file/assets/sha256/abc',
      { method: 'GET', headers: { Range: 'bytes=50-' } },
      env
    );
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('refuses keys outside the servable prefixes', async () => {
    const res = await app.request(
      '/api/v1/assets/file/secrets/config',
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(400);
  });
});

describe('upload content-type policy', () => {
  it('rejects executable and SVG content types', () => {
    expect(isAllowedContentType('text/html')).toBe(false);
    expect(isAllowedContentType('image/svg+xml')).toBe(false);
    expect(isAllowedContentType('image/svg+xml; charset=utf-8')).toBe(false);
    expect(isAllowedContentType('application/javascript')).toBe(false);

    expect(isAllowedContentType('model/gltf-binary')).toBe(true);
    expect(isAllowedContentType('audio/mpeg')).toBe(true);
    expect(isAllowedContentType('application/json')).toBe(true);

    expect(
      validateAssetRequest({
        filename: 'payload.glb',
        contentType: 'text/html',
        sizeBytes: 10
      })
    ).toBe('contentType is not allowed');
  });
});
