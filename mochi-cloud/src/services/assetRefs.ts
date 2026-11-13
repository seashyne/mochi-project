// Access-id references inside a manifest.
//
// An access id is the creator-facing handle for an uploaded file. Publishing must
// reject one that does not exist, is blocked, or that the publisher has no right to
// use - otherwise the failure surfaces on a player's machine at runtime instead of
// in the editor at publish time.
//
// Ids can appear anywhere in a manifest: object properties, and inside Lua script
// text. The scan is over the serialised manifest for that reason, the same way a
// script-embedded reference is caught elsewhere.

import type { D1Database } from '@cloudflare/workers-types';
import { resolveAccessKey, type AccessKeyRecord } from './assetAccessKeys';
import { findAccessKey } from './assetAccessKeysDb';
import type { AccessGrant } from './assetAccess';
import { findFileById } from './fileDb';
import { listGrantsForFile } from './assetAccessDb';

export const ACCESS_ID_IN_TEXT = /acc_[0-9a-f]{20}/g;

/** Ids referenced anywhere in a manifest. Deduped, in first-seen order. */
export function collectAccessIds(text: string, limit = 512): string[] {
  const found = new Set<string>();
  if (typeof text !== 'string' || text.length === 0) return [];
  for (const match of text.matchAll(ACCESS_ID_IN_TEXT)) {
    found.add(match[0]);
    if (found.size >= limit) break;
  }
  return [...found];
}

export interface AccessViewer {
  userId: string | null;
  role: string | null;
  shareTokenHash: string | null;
}

export interface AccessRefLookup {
  findKey: (accessId: string) => Promise<AccessKeyRecord | null>;
  findFile: (fileId: string) => Promise<{ id: string; ownerId: string; visibility: 'private' | 'unlisted' | 'public' } | null>;
  grantsFor: (fileId: string) => Promise<AccessGrant[]>;
}

/** Real lookups, backed by D1. */
export function d1AccessRefLookup(db: D1Database): AccessRefLookup {
  return {
    findKey: (accessId) => findAccessKey(db, accessId),
    findFile: async (fileId) => {
      const file = await findFileById(db, fileId);
      return file
        ? { id: file.id, ownerId: file.ownerId, visibility: file.visibility as 'private' | 'unlisted' | 'public' }
        : null;
    },
    grantsFor: (fileId) => listGrantsForFile(db, fileId)
  };
}

/**
 * Validates every access id the manifest mentions. Returns human-readable problems;
 * an empty array means the publisher may ship.
 */
export async function validateAccessRefs(
  lookup: AccessRefLookup,
  manifestJson: string,
  viewer: AccessViewer,
  nowIso = new Date().toISOString()
): Promise<string[]> {
  const ids = collectAccessIds(manifestJson);
  const errors: string[] = [];

  for (const accessId of ids) {
    const key = await lookup.findKey(accessId);
    if (!key) {
      errors.push(`${accessId}: unknown asset access id`);
      continue;
    }

    const file = await lookup.findFile(key.fileId);
    if (!file) {
      errors.push(`${accessId}: the file behind this id no longer exists`);
      continue;
    }

    const grants = await lookup.grantsFor(file.id);
    const result = resolveAccessKey(key, { ownerId: file.ownerId, visibility: file.visibility }, viewer, grants, nowIso);
    if (!result.ok) {
      errors.push(`${accessId}: not available to this publisher (${result.reason})`);
    }
  }

  return errors;
}
