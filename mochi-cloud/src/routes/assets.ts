import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { AssetUploadRequest, AssetUploadResponse } from '../types/api';
import { createUploadUrl, uploadToR2 } from '../services/storage';
import { isAllowedContentType } from '../services/assetPipeline';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { kindFromContentType, registerUploadedFile } from '../services/fileDb';

export const assetsRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// POST /api/v1/assets/upload-url - Generate asset upload URL (Creator auth required)
assetsRouter.post('/upload-url', authMiddleware, async (c) => {
  try {
    const body = (await c.req.json()) as AssetUploadRequest;
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return c.json(
        { error: 'filename and contentType are required' },
        400
      );
    }

    const result: AssetUploadResponse = createUploadUrl(
      c.env,
      filename,
      contentType
    );

    return c.json(result, 200);
  } catch (err) {
    return c.json(
      { error: `Failed to generate upload URL: ${(err as Error).message}` },
      500
    );
  }
});

// PUT /api/v1/assets/upload - Direct binary asset upload to R2
assetsRouter.put('/upload', optionalAuthMiddleware, async (c) => {
  try {
    const key = c.req.query('key');
    if (!key) {
      return c.json({ error: 'Asset key query parameter is required' }, 400);
    }

    if (!c.env.ASSETS) {
      return c.json({ error: 'R2 storage bucket is not configured' }, 503);
    }

    const contentType =
      c.req.header('Content-Type') || 'application/octet-stream';
    if (!isAllowedContentType(contentType)) {
      return c.json({ error: 'contentType is not allowed' }, 400);
    }
    const body = c.req.raw.body;

    if (!body) {
      return c.json({ error: 'Request body cannot be empty' }, 400);
    }

    await uploadToR2(c.env.ASSETS, key, body, contentType);

    const user = c.get('user');
    let registered = false;
    if (user && c.env.DB) {
      try {
        const head = await c.env.ASSETS.head(key);
        const now = new Date().toISOString();
        await registerUploadedFile(c.env.DB, {
          id: crypto.randomUUID(), ownerId: user.id, folderId: null,
          name: key.split('/').pop() || 'asset', kind: kindFromContentType(contentType),
          objectKey: key, hash: '', sizeBytes: head?.size ?? 0,
          contentType, visibility: 'private', createdAt: now, updatedAt: now
        });
        registered = true;
      } catch {
        // Registry write is best-effort; the bytes are already stored.
      }
    }

    const publicBase =
      c.env.PUBLIC_ASSETS_URL || 'https://assets-game.lenout.com';
    const publicUrl = `${publicBase.replace(/\/+$/, '')}/${key}`;

    return c.json(
      {
        status: 'uploaded',
        key,
        publicUrl,
        registered
      },
      200
    );
  } catch (err) {
    return c.json(
      { error: `Upload failed: ${(err as Error).message}` },
      500
    );
  }
});
