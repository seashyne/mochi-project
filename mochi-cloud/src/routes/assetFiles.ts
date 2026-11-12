// Worker-side asset reads with HTTP Range support, immutable caching, and
// explicit CORS headers for binary consumers (GLB/KTX2/audio). Registry
// visibility gates private objects; unregistered legacy keys stay open.

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { optionalAuthMiddleware } from '../middleware/auth';
import { findFilesByObjectKey } from '../services/fileDb';
import { canRead, evaluateFileAccess, hashShareToken, type Visibility } from '../services/assetAccess';
import { listGrantsForFile } from '../services/assetAccessDb';

export const assetFilesRouter = new Hono<{ Bindings: MochiEnv; Variables: AppVariables }>();

assetFilesRouter.use('*', optionalAuthMiddleware);

const ALLOWED_PREFIXES = ['assets/', 'drafts/'];
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

interface ByteRange {
  offset: number;
  length: number;
  end: number;
}

function parseRange(header: string | undefined, size: number): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (!Number.isFinite(start) || start >= size || end < start) return null;
  return { offset: start, length: end - start + 1, end };
}

assetFilesRouter.get('/file/:key{.+}', async (c) => {
  const bucket = c.env.ASSETS as R2Bucket | undefined;
  if (!bucket) return c.json({ error: 'R2 storage bucket is not configured' }, 503);

  const key = c.req.param('key');
  if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return c.json({ error: 'Asset key is not servable' }, 400);
  }

  let gated = false;
  if (c.env.DB) {
    const registrations = await findFilesByObjectKey(c.env.DB, key);
    const hasOpenGrant = registrations.some((file) => file.visibility !== 'private');
    if (registrations.length > 0 && !hasOpenGrant) {
      gated = true;
      const user = c.get('user');
      const isOwner =
        user && (user.role === 'admin' || registrations.some((file) => file.ownerId === user.id));
      if (!isOwner) {
        const shareToken = c.req.header('X-Access-Token') || c.req.query('access') || null;
        const shareTokenHash = shareToken && shareToken.trim() ? hashShareToken(shareToken.trim()) : null;
        const now = new Date().toISOString();
        let allowed = false;
        for (const file of registrations) {
          const grants = await listGrantsForFile(c.env.DB, file.id);
          const permission = evaluateFileAccess(
            { ownerId: file.ownerId, visibility: file.visibility as Visibility },
            { userId: user?.id ?? null, role: user?.role ?? null, shareTokenHash },
            grants,
            now
          );
          if (canRead(permission)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          return c.json({ error: user ? 'Forbidden' : 'Unauthorized' }, user ? 403 : 401);
        }
      }
    }
  }

  const head = await bucket.head(key);
  if (!head) return c.json({ error: 'Asset not found' }, 404);

  const totalSize = head.size;
  const requested = c.req.header('Range');
  const range = parseRange(requested, totalSize);
  if (requested && !range) {
    return c.body(null, 416, {
      'Content-Range': `bytes */${totalSize}`,
      'Accept-Ranges': 'bytes'
    });
  }

  const object = await bucket.get(
    key,
    range ? { range: { offset: range.offset, length: range.length } } : undefined
  );
  if (!object || !object.body) return c.json({ error: 'Asset not found' }, 404);

  const headers: Record<string, string> = {
    'Content-Type':
      object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': gated
      ? 'private, no-store'
      : object.httpMetadata?.cacheControl || CACHE_CONTROL,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers':
      'Content-Range, Content-Length, Accept-Ranges, ETag',
    ETag: object.httpEtag || object.etag
  };

  if (range) {
    headers['Content-Range'] = `bytes ${range.offset}-${range.end}/${totalSize}`;
    headers['Content-Length'] = String(range.length);
  } else {
    headers['Content-Length'] = String(totalSize);
  }

  return c.body(object.body, range ? 206 : 200, headers);
});
