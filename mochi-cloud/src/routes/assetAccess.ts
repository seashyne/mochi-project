// Asset access grant REST API. Owners manage per-file grants and share tokens;
// any authenticated viewer can resolve their own effective permission.

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import { findFileById } from '../services/fileDb';
import {
  createShareToken,
  evaluateFileAccess,
  hashShareToken,
  validateGrantInput,
  type AccessGrant,
  type Visibility
} from '../services/assetAccess';
import {
  createGrant,
  deleteGrant,
  findGrantByTokenHash,
  listGrantsForFile,
  listGrantsForGrantee
} from '../services/assetAccessDb';
import {
  describeFailure,
  isValidAccessId,
  resolveAccessKey,
  statusToHttpCode,
  type AccessKeyStatus
} from '../services/assetAccessKeys';
import {
  findAccessKey,
  issueAccessKey,
  listAccessKeysWithFiles,
  setAccessKeyStatus
} from '../services/assetAccessKeysDb';
import { resolveAccessAssetUrl } from '../services/assetPipeline';

export const assetAccessRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

assetAccessRouter.use('*', authMiddleware);

function readShareToken(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
}): string | null {
  const header = c.req.header('X-Access-Token');
  if (header && header.trim()) return header.trim();
  const query = c.req.query('access');
  return query && query.trim() ? query.trim() : null;
}

// GET /shared - Files other creators granted this viewer access to
assetAccessRouter.get('/shared', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const grants = await listGrantsForGrantee(c.env.DB, user.id);
  const files = [];
  for (const grant of grants) {
    const file = await findFileById(c.env.DB, grant.fileId);
    if (file) files.push({ file, permission: grant.permission, grantId: grant.id });
  }
  return c.json({ shared: files, total: files.length }, 200);
});

// GET /files/:fileId/permission - Effective permission for the current viewer
assetAccessRouter.get('/files/:fileId/permission', async (c) => {
  const user = c.get('user');
  const file = await findFileById(c.env.DB, c.req.param('fileId'));
  if (!file) return c.json({ error: 'File not found' }, 404);

  const shareToken = readShareToken(c);
  const grants = await listGrantsForFile(c.env.DB, file.id);
  const permission = evaluateFileAccess(
    { ownerId: file.ownerId, visibility: file.visibility as Visibility },
    {
      userId: user?.id ?? null,
      role: user?.role ?? null,
      shareTokenHash: shareToken ? hashShareToken(shareToken) : null
    },
    grants,
    new Date().toISOString()
  );
  return c.json({ permission, fileId: file.id }, 200);
});

// GET /files/:fileId/grants - Owner view of every grant on a file
assetAccessRouter.get('/files/:fileId/grants', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const file = await findFileById(c.env.DB, c.req.param('fileId'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const grants = await listGrantsForFile(c.env.DB, file.id);
  return c.json({ grants, total: grants.length }, 200);
});

// POST /files/:fileId/grants - Create a grant, optionally with a share token
assetAccessRouter.post('/files/:fileId/grants', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const file = await findFileById(c.env.DB, c.req.param('fileId'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = validateGrantInput(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const rawToken = parsed.value.withToken ? createShareToken() : null;
  const grant: AccessGrant = {
    id: crypto.randomUUID(),
    fileId: file.id,
    ownerId: user.id,
    granteeType: parsed.value.granteeType,
    granteeId: parsed.value.granteeType === 'user' ? parsed.value.granteeId ?? null : null,
    permission: parsed.value.permission,
    tokenHash: rawToken ? hashShareToken(rawToken) : null,
    label: parsed.value.label ?? null,
    expiresAt: parsed.value.expiresAt ?? null,
    createdAt: new Date().toISOString()
  };

  await createGrant(c.env.DB, grant);
  return c.json(rawToken ? { grant, token: rawToken } : { grant }, 201);
});

// DELETE /files/:fileId/grants/:grantId - Revoke a grant
assetAccessRouter.delete('/files/:fileId/grants/:grantId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const file = await findFileById(c.env.DB, c.req.param('fileId'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const grantId = c.req.param('grantId');
  const removed = await deleteGrant(c.env.DB, grantId, file.ownerId);
  if (!removed) return c.json({ error: 'Grant not found' }, 404);
  return c.json({ success: true, revokedId: grantId }, 200);
});

// POST /resolve-token - Map a raw share token to its grant (for the client UI)
assetAccessRouter.post('/resolve-token', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  let body: { token?: unknown };
  try {
    body = (await c.req.json()) as { token?: unknown };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof body.token !== 'string' || !body.token.trim()) {
    return c.json({ error: 'token is required' }, 400);
  }

  const grant = await findGrantByTokenHash(c.env.DB, hashShareToken(body.token));
  if (!grant) return c.json({ error: 'Token not found' }, 404);

  const file = await findFileById(c.env.DB, grant.fileId);
  if (!file) return c.json({ error: 'File not found' }, 404);
  return c.json({ file, permission: grant.permission }, 200);
});

// POST /files/:fileId/key - Issue (or return) the access id for an uploaded file
assetAccessRouter.post('/files/:fileId/key', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const file = await findFileById(c.env.DB, c.req.param('fileId'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const key = await issueAccessKey(c.env.DB, file.id, file.ownerId);
  return c.json({ key, url: resolveAccessAssetUrl(c.env, file.objectKey) }, 201);
});

// GET /keys - Every access id owned by the caller
assetAccessRouter.get('/keys', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const keys = await listAccessKeysWithFiles(c.env.DB, user.id);
  const items = keys.map((key) => ({ ...key, url: resolveAccessAssetUrl(c.env, key.objectKey) }));
  return c.json({ keys: items, total: items.length }, 200);
});

// PATCH /keys/:accessId - Owner toggles the key between ready and blocked
assetAccessRouter.patch('/keys/:accessId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const accessId = c.req.param('accessId');
  if (!isValidAccessId(accessId)) return c.json({ error: 'Invalid access id' }, 400);

  const key = await findAccessKey(c.env.DB, accessId);
  if (!key) return c.json({ error: 'Unknown asset access id' }, 404);
  if (key.ownerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let body: { status?: unknown };
  try {
    body = (await c.req.json()) as { status?: unknown };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (body.status !== 'ready' && body.status !== 'blocked') {
    return c.json({ error: "status must be 'ready' or 'blocked'" }, 400);
  }

  const updated = await setAccessKeyStatus(c.env.DB, accessId, key.ownerId, body.status as AccessKeyStatus);
  if (!updated) return c.json({ error: 'Key update failed' }, 500);
  return c.json({ accessId, status: body.status }, 200);
});

// GET /assets/:accessId - Resolve an access id into servable asset metadata.
// This is the gate that makes "upload first, then use" enforceable: an unknown,
// pending, blocked, or unauthorised id never yields a URL.
assetAccessRouter.get('/assets/:accessId', async (c) => {
  const user = c.get('user');
  const accessId = c.req.param('accessId');
  if (!isValidAccessId(accessId)) return c.json({ error: 'Invalid access id' }, 400);

  const key = await findAccessKey(c.env.DB, accessId);
  if (!key) return c.json({ error: 'Unknown asset access id' }, 404);

  const file = await findFileById(c.env.DB, key.fileId);
  const shareToken = readShareToken(c);
  const grants = file ? await listGrantsForFile(c.env.DB, file.id) : [];
  const result = resolveAccessKey(
    key,
    file ? { ownerId: file.ownerId, visibility: file.visibility as Visibility } : null,
    {
      userId: user?.id ?? null,
      role: user?.role ?? null,
      shareTokenHash: shareToken ? hashShareToken(shareToken) : null
    },
    grants,
    new Date().toISOString()
  );

  if (!result.ok) {
    return c.json({ error: describeFailure(result.reason) }, statusToHttpCode(result.reason));
  }
  if (!file) return c.json({ error: 'Unknown asset access id' }, 404);

  return c.json(
    {
      accessId: key.accessId,
      fileId: file.id,
      name: file.name,
      kind: file.kind,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      visibility: file.visibility,
      status: key.status,
      url: resolveAccessAssetUrl(c.env, file.objectKey)
    },
    200
  );
});
