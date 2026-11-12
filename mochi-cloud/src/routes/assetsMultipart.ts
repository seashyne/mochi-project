// Resumable multipart asset upload routes for multi-gigabyte game packages.
// Parts are proxied to R2 through the Worker, so each request stays below the
// platform body limit while total asset size is bounded by R2, not by a Worker.

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import {
  MultipartCompleteRequest,
  MultipartCreateRequest,
  MultipartCreateResponse,
  MultipartPartResponse
} from '../types/api';
import { authMiddleware } from '../middleware/auth';
import {
  AssetUploadTokenPayload,
  IMMUTABLE_CACHE_CONTROL,
  buildAssetKey,
  computePartSize,
  computeTotalParts,
  normalizeParts,
  resolvePublicUrl,
  signUploadToken,
  validateAssetRequest,
  verifyUploadToken
} from '../services/assetPipeline';
import { hashPassThrough, verifyStoredObject } from '../services/assetIntegrity';
import { kindFromContentType, registerUploadedFile } from '../services/fileDb';
import { issueAccessKey } from '../services/assetAccessKeysDb';

export const assetsMultipartRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

function readUploadToken(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header('X-Upload-Token');
}

async function registerUpload(
  env: MochiEnv,
  info: { userId: string; key: string; filename?: string; contentType: string; sizeBytes: number; sha256?: string }
): Promise<boolean> {
  if (!env.DB) return false;
  try {
    const now = new Date().toISOString();
    const registered = await registerUploadedFile(env.DB, {
      id: crypto.randomUUID(), ownerId: info.userId, folderId: null,
      name: info.filename || 'asset', kind: kindFromContentType(info.contentType),
      objectKey: info.key, hash: info.sha256 || '', sizeBytes: info.sizeBytes,
      contentType: info.contentType, visibility: 'private', createdAt: now, updatedAt: now
    });
    // Every stored object gets its access id immediately so scenes can only
    // reference content that has actually finished uploading.
    await issueAccessKey(env.DB, registered.id, registered.ownerId, now);
    return true;
  } catch {
    // Bytes are already stored; a registry failure must not fail the upload.
    return false;
  }
}

async function requireUploadToken(
  env: MochiEnv,
  token: string | undefined,
  key: string | undefined,
  uploadId: string | undefined
): Promise<AssetUploadTokenPayload | null> {
  const payload = await verifyUploadToken(env, token);
  if (!payload || !key || !uploadId) return null;
  if (payload.key !== key || payload.uploadId !== uploadId) return null;
  return payload;
}

type MultipartGuard =
  | { ok: true; bucket: R2Bucket; payload: AssetUploadTokenPayload }
  | { ok: false; status: 401 | 503; message: string };

// Shared preamble for the part/complete/abort routes: require R2 multipart
// support plus a token bound to the exact key and uploadId being addressed.
async function guardMultipart(
  env: MochiEnv,
  token?: string,
  key?: string,
  uploadId?: string
): Promise<MultipartGuard> {
  const bucket = env.ASSETS as R2Bucket | undefined;
  if (!bucket || typeof bucket.resumeMultipartUpload !== 'function') {
    return { ok: false, status: 503, message: 'R2 multipart upload is not configured' };
  }
  const payload = await requireUploadToken(env, token, key, uploadId);
  return payload
    ? { ok: true, bucket, payload }
    : { ok: false, status: 401, message: 'Invalid or expired upload token' };
}

// POST /multipart/create - Start or deduplicate a resumable asset upload
assetsMultipartRouter.post('/multipart/create', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const bucket = c.env.ASSETS as R2Bucket | undefined;
    if (!bucket || typeof bucket.createMultipartUpload !== 'function') {
      return c.json({ error: 'R2 multipart upload is not configured' }, 503);
    }

    const body = (await c.req.json()) as MultipartCreateRequest;
    const validationError = validateAssetRequest(body);
    if (validationError) return c.json({ error: validationError }, 400);

    const sha256 = body.sha256?.toLowerCase();
    const assetKey = buildAssetKey(user.id, body.filename, sha256);
    const publicUrl = resolvePublicUrl(c.env, assetKey);

    const existing = await bucket.head(assetKey);
    if (existing) {
      const registered = await registerUpload(c.env, {
        userId: user.id, key: assetKey, filename: body.filename,
        contentType: body.contentType, sizeBytes: existing.size, sha256
      });
      const response: MultipartCreateResponse = {
        existing: true,
        assetKey,
        publicUrl,
        sizeBytes: existing.size
      };
      return c.json({ ...response, registered }, 200);
    }

    const partSize = computePartSize(body.sizeBytes);
    const totalParts = computeTotalParts(body.sizeBytes, partSize);
    const upload = await bucket.createMultipartUpload(assetKey, {
      httpMetadata: { contentType: body.contentType, cacheControl: IMMUTABLE_CACHE_CONTROL },
      customMetadata: { uploader: user.id, ...(sha256 ? { sha256 } : {}) }
    });

    const uploadToken = await signUploadToken(c.env, {
      key: assetKey,
      uploadId: upload.uploadId,
      sizeBytes: body.sizeBytes,
      contentType: body.contentType,
      userId: user.id,
      filename: body.filename,
      ...(sha256 ? { sha256 } : {})
    });

    const response: MultipartCreateResponse = {
      existing: false,
      assetKey,
      publicUrl,
      uploadId: upload.uploadId,
      uploadToken,
      partSize,
      totalParts,
      sizeBytes: body.sizeBytes
    };
    return c.json(response, 200);
  } catch (err) {
    return c.json(
      { error: `Failed to create upload: ${(err as Error).message}` },
      500
    );
  }
});

// PUT /multipart/part?key=&uploadId=&partNumber= - Stream one part to R2
assetsMultipartRouter.put('/multipart/part', async (c) => {
  try {
    const guard = await guardMultipart(c.env, readUploadToken(c), c.req.query('key'), c.req.query('uploadId'));
    if (!guard.ok) return c.json({ error: guard.message }, guard.status);
    const { bucket, payload } = guard;

    const partNumber = Number(c.req.query('partNumber'));
    const totalParts = computeTotalParts(
      payload.sizeBytes,
      computePartSize(payload.sizeBytes)
    );
    if (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > totalParts
    ) {
      return c.json({ error: 'partNumber is out of range' }, 400);
    }

    const stream = c.req.raw.body;
    if (!stream) return c.json({ error: 'Part body is required' }, 400);

    const expectedPartHash = c.req.header('X-Part-Sha256')?.toLowerCase();
    const hashed = expectedPartHash ? hashPassThrough(stream) : null;
    const body = hashed ? hashed.stream : stream;

    const upload = bucket.resumeMultipartUpload(payload.key, payload.uploadId);
    const uploaded = await upload.uploadPart(partNumber, body);
    if (hashed && hashed.digestHex() !== expectedPartHash) {
      return c.json({ error: `Part ${partNumber} hash mismatch` }, 400);
    }
    const response: MultipartPartResponse = {
      partNumber: uploaded.partNumber,
      etag: uploaded.etag
    };
    return c.json(response, 200);
  } catch (err) {
    return c.json(
      { error: `Failed to upload part: ${(err as Error).message}` },
      400
    );
  }
});

// POST /multipart/complete?key=&uploadId= - Finalize and verify the object
assetsMultipartRouter.post('/multipart/complete', async (c) => {
  try {
    const guard = await guardMultipart(c.env, readUploadToken(c), c.req.query('key'), c.req.query('uploadId'));
    if (!guard.ok) return c.json({ error: guard.message }, guard.status);
    const { bucket, payload } = guard;

    const body = (await c.req.json()) as MultipartCompleteRequest;
    const partSize = computePartSize(payload.sizeBytes);
    const totalParts = computeTotalParts(payload.sizeBytes, partSize);
    const parts = normalizeParts(body.parts, totalParts);
    if (!parts) {
      return c.json(
        { error: 'parts must cover every part number exactly once' },
        400
      );
    }

    const upload = bucket.resumeMultipartUpload(payload.key, payload.uploadId);
    const object = await upload.complete(parts);

    if (object.size !== payload.sizeBytes) {
      await bucket.delete(payload.key);
      return c.json(
        {
          error: `Uploaded size ${object.size} does not match declared ${payload.sizeBytes}`
        },
        400
      );
    }

    const verified = await verifyStoredObject(
      bucket,
      payload.key,
      payload.sha256,
      object.size
    );
    if (verified === false) {
      await bucket.delete(payload.key);
      return c.json({ error: 'Uploaded content does not match declared sha256' }, 400);
    }

    const registered = await registerUpload(c.env, {
      userId: payload.userId, key: payload.key, filename: payload.filename,
      contentType: payload.contentType, sizeBytes: object.size, sha256: payload.sha256
    });

    return c.json(
      {
        assetKey: payload.key,
        publicUrl: resolvePublicUrl(c.env, payload.key),
        sizeBytes: object.size,
        contentType: payload.contentType,
        etag: object.etag,
        registered,
        ...(verified === null ? {} : { hashVerified: verified })
      },
      200
    );
  } catch (err) {
    return c.json(
      { error: `Failed to complete upload: ${(err as Error).message}` },
      400
    );
  }
});

// DELETE /multipart/abort?key=&uploadId= - Discard an incomplete upload
assetsMultipartRouter.delete('/multipart/abort', async (c) => {
  try {
    const guard = await guardMultipart(c.env, readUploadToken(c), c.req.query('key'), c.req.query('uploadId'));
    if (!guard.ok) return c.json({ error: guard.message }, guard.status);
    const { bucket, payload } = guard;

    const upload = bucket.resumeMultipartUpload(payload.key, payload.uploadId);
    await upload.abort();
    return c.json({ success: true, assetKey: payload.key }, 200);
  } catch (err) {
    return c.json(
      { error: `Failed to abort upload: ${(err as Error).message}` },
      400
    );
  }
});
