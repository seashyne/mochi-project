// Draft manifest persistence shared by the StudioDraftDO flush path: decides
// between inline D1 storage and content-addressed R2 (same policy as the
// drafts route) and writes the record through saveStudioDraft.

import type { MochiEnv } from '../types/env';
import { sha256Hex } from './sha256';
import { IMMUTABLE_CACHE_CONTROL } from './assetPipeline';
import { saveStudioDraft, findStudioDraftById, StudioDraftRecord } from './draftDb';

const MAX_INLINE_MANIFEST_BYTES = 64 * 1024;

export interface PersistDraftInput {
  draftId: string;
  manifestJson: string;
  title?: string;
  versionNumber?: string;
}

/** Loads a draft and hydrates its manifest from R2 when it was moved out of D1. */
export async function loadDraftForCollab(
  env: MochiEnv,
  draftId: string
): Promise<StudioDraftRecord | null> {
  const draft = await findStudioDraftById(env.DB, draftId);
  if (!draft) return null;
  if (!draft.manifestKey || draft.manifestJson) return draft;
  const bucket = env.ASSETS as R2Bucket | undefined;
  if (!bucket || typeof bucket.get !== 'function') return draft;
  const object = await bucket.get(draft.manifestKey);
  if (!object) return draft;
  return { ...draft, manifestJson: await object.text() };
}

/**
 * Persists the authoritative collab manifest back to storage. The existing
 * record's metadata (creator, game id, slug...) is preserved; only the
 * manifest body (and optional title/version) is rewritten.
 */
export async function persistCollabDraft(
  env: MochiEnv,
  input: PersistDraftInput
): Promise<StudioDraftRecord | null> {
  const existing = await findStudioDraftById(env.DB, input.draftId);
  if (!existing) return null;

  const manifestBytes = new TextEncoder().encode(input.manifestJson);
  let storedManifest = input.manifestJson;
  let manifestKey: string | null = null;
  let manifestHash: string | null = null;
  let manifestSize: number | null = null;

  if (manifestBytes.length > MAX_INLINE_MANIFEST_BYTES) {
    const bucket = env.ASSETS as R2Bucket | undefined;
    if (!bucket || typeof bucket.put !== 'function') {
      throw new Error('R2 storage is not configured for large draft manifests');
    }
    manifestHash = sha256Hex(manifestBytes);
    manifestKey = `drafts/sha256/${manifestHash}`;
    manifestSize = manifestBytes.length;
    await bucket.put(manifestKey, input.manifestJson, {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: IMMUTABLE_CACHE_CONTROL
      }
    });
    storedManifest = '';
  }

  const record: StudioDraftRecord = {
    ...existing,
    title: input.title?.trim() || existing.title,
    versionNumber: input.versionNumber?.trim() || existing.versionNumber,
    manifestJson: storedManifest,
    manifestKey,
    manifestHash,
    manifestSize,
    updatedAt: new Date().toISOString()
  };

  return saveStudioDraft(env.DB, record);
}
