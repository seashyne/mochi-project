// Pure Team Create op helpers. Local edits are diffed into ops, remote ops are
// folded back into the local object list. No React or WebSocket dependencies so
// convergence behaviour can be unit tested in isolation.

import type { StudioObject } from '@/engine/studio/types';

export type TeamOp =
  | { kind: 'add'; object: StudioObject }
  | { kind: 'remove'; ids: string[] }
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'bulk'; ops: TeamOp[] }
  | { kind: 'manifest_patch'; fields: Record<string, unknown> };

export const SYNCED_MANIFEST_FIELDS = ['scriptCode', 'language', 'environment'] as const;
export const MAX_BULK_OPS = 200;
export const ALLOWED_MANIFEST_PATCH_KEYS = new Set<string>(SYNCED_MANIFEST_FIELDS);

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function shallowPatch(previous: StudioObject, next: StudioObject): Record<string, unknown> {
  const before = asRecord(previous);
  const after = asRecord(next);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'id') continue;
    if (stable(before[key]) !== stable(after[key])) {
      patch[key] = key in after ? after[key] : null;
    }
  }
  return patch;
}

/** Produces removes, then adds, then updates. Order matches the DO's op policy. */
export function diffObjects(previous: StudioObject[], next: StudioObject[]): TeamOp[] {
  const before = new Map(previous.map((object) => [object.id, object]));
  const after = new Map(next.map((object) => [object.id, object]));
  const ops: TeamOp[] = [];

  const removed = previous.filter((object) => !after.has(object.id)).map((object) => object.id);
  if (removed.length > 0) ops.push({ kind: 'remove', ids: removed });

  const added = next.filter((object) => !before.has(object.id));
  for (const object of added) ops.push({ kind: 'add', object });

  for (const object of next) {
    const original = before.get(object.id);
    if (!original) continue;
    const patch = shallowPatch(original, object);
    if (Object.keys(patch).length > 0) ops.push({ kind: 'update', id: object.id, patch });
  }
  return ops;
}

/** Applies a remote op. Returns the same array reference when nothing changed. */
export function applyTeamOp(objects: StudioObject[], op: TeamOp): StudioObject[] {
  switch (op.kind) {
    case 'add': {
      if (objects.some((object) => object.id === op.object.id)) return objects;
      return [...objects, op.object];
    }
    case 'remove': {
      const doomed = new Set(op.ids);
      return objects.filter((object) => !doomed.has(object.id));
    }
    case 'update': {
      return objects.map((object) => (
        object.id === op.id ? { ...object, ...op.patch, id: object.id } as StudioObject : object
      ));
    }
    case 'bulk': {
      return op.ops.reduce<StudioObject[]>((acc, inner) => applyTeamOp(acc, inner), objects);
    }
    default:
      return objects;
  }
}

export function chunkOps(ops: TeamOp[], size = MAX_BULK_OPS): TeamOp[][] {
  const chunks: TeamOp[][] = [];
  for (let index = 0; index < ops.length; index += size) {
    chunks.push(ops.slice(index, index + size));
  }
  return chunks;
}

export function diffManifestFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of SYNCED_MANIFEST_FIELDS) {
    if (stable(previous[key]) !== stable(next[key])) fields[key] = next[key] ?? null;
  }
  return fields;
}
