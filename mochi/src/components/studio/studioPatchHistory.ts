// Patch-based undo/redo for the Studio document.
//
// A history entry stores the delta of an edit - the objects that were added,
// removed or changed - instead of a full document snapshot. Memory therefore
// scales with what the user edited, not with the size of the scene.
//
// Pure data and array maths: no React, no THREE, so it is unit-testable.

import type { StudioObject } from '../../engine/studio/types';

export interface IndexedObject {
  /** Position in the array the object belonged to. */
  index: number;
  object: StudioObject;
}

export interface ObjectUpdate {
  before: StudioObject;
  after: StudioObject;
}

export interface ObjectPatch {
  added: IndexedObject[];
  removed: IndexedObject[];
  updated: ObjectUpdate[];
}

export interface PatchHistoryEntry {
  patch: ObjectPatch;
  mergeKey: string | null;
  at: number;
}

export interface PatchHistoryOptions {
  limit?: number;
  mergeWindowMs?: number;
}

export interface PatchHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export interface PatchHistoryController {
  record: (patch: ObjectPatch, options?: { mergeKey?: string }) => void;
  /** Returns the inverse patch to apply, or null when there is nothing to undo. */
  undo: () => ObjectPatch | null;
  /** Returns the forward patch to re-apply, or null when there is nothing to redo. */
  redo: () => ObjectPatch | null;
  clear: () => void;
  getState: () => PatchHistoryState;
}

export const DEFAULT_PATCH_LIMIT = 100;
export const DEFAULT_PATCH_MERGE_WINDOW_MS = 600;

export function isEmptyPatch(patch: ObjectPatch): boolean {
  return patch.added.length === 0 && patch.removed.length === 0 && patch.updated.length === 0;
}

/** Diffs two documents by object identity; null when nothing changed. */
export function diffObjects(prev: StudioObject[], next: StudioObject[]): ObjectPatch | null {
  const prevById = new Map(prev.map((object) => [object.id, object]));
  const nextById = new Map(next.map((object) => [object.id, object]));

  const removed: IndexedObject[] = [];
  prev.forEach((object, index) => {
    if (!nextById.has(object.id)) removed.push({ index, object });
  });

  const added: IndexedObject[] = [];
  next.forEach((object, index) => {
    if (!prevById.has(object.id)) added.push({ index, object });
  });

  const updated: ObjectUpdate[] = [];
  next.forEach((object) => {
    const before = prevById.get(object.id);
    if (before && before !== object) updated.push({ before, after: object });
  });

  const patch: ObjectPatch = { added, removed, updated };
  return isEmptyPatch(patch) ? null : patch;
}

/** Applies a patch forward. Added objects land back at their recorded index. */
export function applyPatch(objects: StudioObject[], patch: ObjectPatch): StudioObject[] {
  const removedIds = new Set(patch.removed.map((entry) => entry.object.id));
  let result = removedIds.size > 0 ? objects.filter((object) => !removedIds.has(object.id)) : objects;

  if (patch.updated.length > 0) {
    const byId = new Map(patch.updated.map((update) => [update.after.id, update.after]));
    result = result.map((object) => byId.get(object.id) ?? object);
  }

  if (patch.added.length > 0) {
    const inserts = [...patch.added].sort((a, b) => a.index - b.index);
    for (const entry of inserts) {
      const at = Math.max(0, Math.min(entry.index, result.length));
      result = [...result.slice(0, at), entry.object, ...result.slice(at)];
    }
  }

  return result;
}

export function invertPatch(patch: ObjectPatch): ObjectPatch {
  return {
    added: patch.removed,
    removed: patch.added,
    updated: patch.updated.map((update) => ({ before: update.after, after: update.before }))
  };
}

/**
 * Coalesces two edits of the same merge window (one gizmo drag). Returns null
 * when the pair cannot be merged, which makes the caller start a fresh entry -
 * structural edits (add/remove) always start a fresh entry.
 */
export function mergeObjectPatches(older: ObjectPatch, newer: ObjectPatch): ObjectPatch | null {
  if (older.added.length || older.removed.length || newer.added.length || newer.removed.length) {
    return null;
  }
  const merged = new Map<string, ObjectUpdate>();
  older.updated.forEach((update) => merged.set(update.before.id, update));
  newer.updated.forEach((update) => {
    const existing = merged.get(update.before.id);
    merged.set(update.before.id, { before: existing ? existing.before : update.before, after: update.after });
  });
  return { added: [], removed: [], updated: [...merged.values()] };
}

export function createPatchHistory(options: PatchHistoryOptions = {}): PatchHistoryController {
  const limit = options.limit ?? DEFAULT_PATCH_LIMIT;
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_PATCH_MERGE_WINDOW_MS;

  let past: PatchHistoryEntry[] = [];
  let future: PatchHistoryEntry[] = [];

  return {
    record(patch, recordOptions) {
      if (isEmptyPatch(patch)) return;
      const now = Date.now();
      const mergeKey = recordOptions?.mergeKey ?? null;
      const last = past[past.length - 1];

      if (mergeKey && last && last.mergeKey === mergeKey && now - last.at < mergeWindowMs) {
        const merged = mergeObjectPatches(last.patch, patch);
        if (merged) {
          past = [...past.slice(0, -1), { patch: merged, mergeKey, at: now }];
          future = [];
          return;
        }
      }

      const next = [...past, { patch, mergeKey, at: now }];
      past = next.length > limit ? next.slice(next.length - limit) : next;
      future = [];
    },

    undo() {
      const entry = past[past.length - 1];
      if (!entry) return null;
      past = past.slice(0, -1);
      future = [entry, ...future];
      return invertPatch(entry.patch);
    },

    redo() {
      const entry = future[0];
      if (!entry) return null;
      future = future.slice(1);
      past = [...past, entry];
      return entry.patch;
    },

    clear() {
      past = [];
      future = [];
    },

    getState() {
      return {
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        undoDepth: past.length,
        redoDepth: future.length
      };
    }
  };
}
