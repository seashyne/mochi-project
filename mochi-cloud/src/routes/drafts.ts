// Hono Router for Mochi Studio Project Drafts Endpoints

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import { inspectManifest } from '../services/manifestValidation';
import { validateServerManifest } from '../services/serverScriptValidation';
import { collectObjectAssetRefs, formatRefFailure } from '../services/objectAssetRefs';
import { isValidAccessId, resolveAccessKey } from '../services/assetAccessKeys';
import { findAccessKey } from '../services/assetAccessKeysDb';
import { listGrantsForFile } from '../services/assetAccessDb';
import { IMMUTABLE_CACHE_CONTROL } from '../services/assetPipeline';
import { sha256Hex } from '../services/sha256';
import {
  SaveDraftRequest,
  StudioDraftRecord,
  saveStudioDraft,
  findStudioDraftById,
  listStudioDraftsByCreator,
  deleteStudioDraft
} from '../services/draftDb';
import { findFileById } from '../services/fileDb';
import { findCollaborator } from '../services/studioCollabDb';

export const draftsRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Small manifests stay inline in D1; larger ones move to content-addressed R2
// objects so D1 rows stay small while drafts still hold thousands of objects.
const MAX_INLINE_MANIFEST_BYTES = 64 * 1024;
const MAX_DRAFT_MANIFEST_BYTES = 16 * 1024 * 1024;

async function hydrateDraftManifest(
  env: MochiEnv,
  draft: StudioDraftRecord
): Promise<StudioDraftRecord> {
  if (!draft.manifestKey || draft.manifestJson) return draft;
  const bucket = env.ASSETS as R2Bucket | undefined;
  if (!bucket || typeof bucket.get !== 'function') return draft;
  const object = await bucket.get(draft.manifestKey);
  if (!object) return draft;
  return { ...draft, manifestJson: await object.text() };
}

// POST / - Save or update draft project
draftsRouter.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = (await c.req.json()) as SaveDraftRequest;
    if (!body.title || !body.title.trim()) {
      return c.json({ error: 'Draft title is required' }, 400);
    }
    if (!body.manifestJson || typeof body.manifestJson !== 'string') {
      return c.json({ error: 'manifestJson must be a valid JSON string' }, 400);
    }

    if (new TextEncoder().encode(body.manifestJson).length > MAX_DRAFT_MANIFEST_BYTES) {
      return c.json({ error: 'Draft manifest exceeds 16MB ceiling' }, 400);
    }

    const inspection = inspectManifest(body.manifestJson, MAX_DRAFT_MANIFEST_BYTES);
    if (!inspection.valid) {
      return c.json(
        {
          error: 'Invalid draft manifest',
          details: inspection.errors,
          manifestVersion: inspection.manifestVersion
        },
        400
      );
    }

    let parsedManifest: unknown = null;
    try {
      parsedManifest = JSON.parse(body.manifestJson);
    } catch {
      parsedManifest = null;
    }
    const serverCheck = validateServerManifest(parsedManifest);
    if (serverCheck.errors.length > 0) {
      return c.json(
        { error: 'Invalid server script manifest', details: serverCheck.errors },
        400
      );
    }

    // Upload-before-use gate: every referenced access id must resolve to a
    // ready, readable upload owned by (or shared with) this creator.
    const assetRefs = collectObjectAssetRefs(parsedManifest);
    if (assetRefs.length > 0) {
      const failures: string[] = [];
      const nowIso = new Date().toISOString();
      for (const ref of assetRefs) {
        const key = isValidAccessId(ref.accessId)
          ? await findAccessKey(c.env.DB, ref.accessId)
          : null;
        const file = key ? await findFileById(c.env.DB, key.fileId) : null;
        const grants = file ? await listGrantsForFile(c.env.DB, file.id) : [];
        const result = resolveAccessKey(
          key,
          file ? { ownerId: file.ownerId, visibility: file.visibility } : null,
          { userId: user.id, role: user.role },
          grants,
          nowIso
        );
        if (!result.ok) failures.push(formatRefFailure(ref, result.reason));
      }
      if (failures.length > 0) {
        return c.json(
          { error: 'Assets must be uploaded before they can be used', details: failures },
          400
        );
      }
    }

    const draftId = body.id || crypto.randomUUID();
    const existing = await findStudioDraftById(c.env.DB, draftId);
    // Team Create editors may save offline, but ownership never transfers and
    // viewers stay read-only. While a live room exists the DO is the writer.
    if (existing && existing.creatorId !== user.id && user.role !== 'admin') {
      const grant = await findCollaborator(c.env.DB, draftId, user.id);
      if (grant !== 'editor') {
        return c.json({ error: 'Forbidden: You cannot write this draft' }, 403);
      }
    }

    const manifestBytes = new TextEncoder().encode(body.manifestJson);
    let storedManifest = body.manifestJson;
    let manifestKey: string | null = null;
    let manifestHash: string | null = null;
    let manifestSize: number | null = null;

    if (manifestBytes.length > MAX_INLINE_MANIFEST_BYTES) {
      const bucket = c.env.ASSETS as R2Bucket | undefined;
      if (!bucket || typeof bucket.put !== 'function') {
        return c.json(
          { error: 'R2 storage is not configured for large draft manifests' },
          503
        );
      }
      manifestHash = sha256Hex(manifestBytes);
      manifestKey = `drafts/sha256/${manifestHash}`;
      manifestSize = manifestBytes.length;
      await bucket.put(manifestKey, body.manifestJson, {
        httpMetadata: {
          contentType: 'application/json',
          cacheControl: IMMUTABLE_CACHE_CONTROL
        }
      });
      storedManifest = '';
    }

    const now = new Date().toISOString();
    const record: StudioDraftRecord = {
      id: draftId,
      creatorId: existing?.creatorId || user.id,
      gameId: body.gameId || existing?.gameId || null,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      slug: body.slug?.trim() || null,
      manifestJson: storedManifest,
      manifestKey,
      manifestHash,
      manifestSize,
      versionNumber: body.versionNumber?.trim() || '0.1.0',
      isAutosave: Boolean(body.isAutosave),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    const saved = await saveStudioDraft(c.env.DB, record);
    return c.json(
      { draft: { ...saved, manifestJson: body.manifestJson } },
      existing ? 200 : 201
    );
  } catch (err) {
    return c.json({ error: `Failed to save draft: ${(err as Error).message}` }, 500);
  }
});

// GET /mine - List all drafts belonging to current creator
draftsRouter.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const drafts = await listStudioDraftsByCreator(c.env.DB, user.id);
  return c.json({ drafts, total: drafts.length }, 200);
});

// GET /:id - Fetch draft details by ID
draftsRouter.get('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Draft ID is required' }, 400);

  const draft = await findStudioDraftById(c.env.DB, id);
  if (!draft) return c.json({ error: 'Draft not found' }, 404);

  if (draft.creatorId !== user.id && user.role !== 'admin') {
    const granted = await findCollaborator(c.env.DB, id, user.id);
    if (!granted) return c.json({ error: 'Forbidden: You do not have access to this draft' }, 403);
  }

  return c.json({ draft: await hydrateDraftManifest(c.env, draft) }, 200);
});

// DELETE /:id - Delete draft project
draftsRouter.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Draft ID is required' }, 400);

  const draft = await findStudioDraftById(c.env.DB, id);
  if (!draft) return c.json({ error: 'Draft not found' }, 404);

  if (draft.creatorId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden: You do not own this draft' }, 403);
  }

  const success = await deleteStudioDraft(c.env.DB, id, user.id);
  return c.json({ success, deletedId: id }, 200);
});
