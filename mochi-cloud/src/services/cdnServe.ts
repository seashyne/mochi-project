// Edge CDN Asset & 3D Model Serving Engine for R2 Storage (mochi-assets)
// Serves models-game.lenout.com and assets-game.lenout.com with Range streaming,
// high-performance immutable caching, and cross-origin CORS support.

import { Context } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { verifyToken } from '../middleware/auth';

export function isCdnHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'assets.lenout.com' ||
    lower === 'cdn.lenout.com' ||
    lower === 'assets-game.lenout.com' ||
    lower === 'models-game.lenout.com' ||
    lower.startsWith('assets') ||
    lower.startsWith('models') ||
    lower.startsWith('cdn')
  );
}

export function isPrivateAssetPath(path: string): boolean {
  const clean = path.replace(/^\/+/, '');
  return (
    clean.startsWith('drafts/') ||
    clean.startsWith('private/') ||
    clean.startsWith('staging/')
  );
}

function extractAccessToken(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>
): string | null {
  const queryToken = c.req.query('token') || c.req.query('access');
  if (queryToken && queryToken.trim()) return queryToken.trim();

  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const xToken = c.req.header('X-Access-Token');
  if (xToken && xToken.trim()) return xToken.trim();

  return null;
}

function resolveContentType(key: string, storedType?: string): string {
  if (storedType && storedType !== 'application/octet-stream') {
    return storedType;
  }
  const ext = key.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    bin: 'application/octet-stream',
    obj: 'text/plain',
    mtl: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    ktx2: 'image/ktx2',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    wasm: 'application/wasm',
    zip: 'application/zip',
    json: 'application/json',
    mochi: 'application/x-mochi'
  };
  return map[ext] || 'application/octet-stream';
}

export async function serveCdnRequest(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>
): Promise<Response> {
  const url = new URL(c.req.url);
  const host = url.hostname.toLowerCase();
  const rawPath = url.pathname.replace(/^\/+/, '');
  const isModelsHost = host.includes('models');

  // Handle preflight OPTIONS request on CDN domains
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Root informational probe
  if (!rawPath) {
    return c.json({
      service: isModelsHost ? 'mochi-models-storage' : 'mochi-assets-storage',
      status: 'online',
      host,
      bucket: 'mochi-assets',
      supportedTypes: ['3d-models (.glb, .gltf)', 'textures', 'audio', 'game-bundles']
    });
  }

  // Access Control Mode 2: Verify Signed Token for private / draft assets
  if (isPrivateAssetPath(rawPath)) {
    const token = extractAccessToken(c);
    const valid =
      token && c.env.JWT_SECRET
        ? await verifyToken<Record<string, unknown>>(token, c.env.JWT_SECRET)
        : null;
    if (!valid) {
      return c.json(
        { error: 'Forbidden', message: 'Valid access token required for private asset' },
        403,
        { 'Access-Control-Allow-Origin': '*' }
      );
    }
  }

  const bucket = c.env.ASSETS;
  if (!bucket) {
    return c.json({ error: 'R2 storage bucket is not configured' }, 503);
  }

  // Lookup key: try exact path, and if on models host, try models/<path>
  let key = rawPath;
  let head = await bucket.head(key);
  if (!head && isModelsHost && !key.startsWith('models/')) {
    key = `models/${rawPath}`;
    head = await bucket.head(key);
  }
  if (!head && !key.startsWith('assets/')) {
    key = `assets/${rawPath}`;
    head = await bucket.head(key);
  }

  if (!head) {
    return c.json({ error: 'Asset not found', key: rawPath }, 404);
  }

  const totalSize = head.size;
  const requestedRange = c.req.header('Range');
  let range: { offset: number; length: number; end: number } | null = null;

  if (requestedRange) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange.trim());
    if (match) {
      const [, sStr, eStr] = match;
      const start = sStr ? Number(sStr) : (eStr ? totalSize - Number(eStr) : 0);
      const end = eStr && sStr ? Math.min(Number(eStr), totalSize - 1) : totalSize - 1;
      if (Number.isFinite(start) && start < totalSize && end >= start) {
        range = { offset: start, length: end - start + 1, end };
      }
    }
  }

  const object = await bucket.get(
    key,
    range ? { range: { offset: range.offset, length: range.length } } : undefined
  );

  if (!object || !object.body) {
    return c.json({ error: 'Asset data unavailable' }, 404);
  }

  const contentType = resolveContentType(key, object.httpMetadata?.contentType);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
    'Accept-Ranges': 'bytes',
    'Cache-Control': isPrivateAssetPath(rawPath)
      ? 'private, no-cache, no-store'
      : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    ETag: object.httpEtag || object.etag
  };

  if (range) {
    headers['Content-Range'] = `bytes ${range.offset}-${range.end}/${totalSize}`;
    headers['Content-Length'] = String(range.length);
    return c.body(object.body, 206, headers);
  }

  headers['Content-Length'] = String(totalSize);
  return c.body(object.body, 200, headers);
}
