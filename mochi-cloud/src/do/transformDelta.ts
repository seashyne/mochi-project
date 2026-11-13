// Validation for `transform_delta` room events.
//
// The room relays these at 10 Hz per peer, so the shape is checked before it is
// forwarded: a malformed or oversized payload is dropped silently rather than
// broadcast to everyone else in the session.

export interface TransformDeltaEntry {
  id: string;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface TransformDeltaPayload {
  tick: number;
  entries: TransformDeltaEntry[];
  removed: string[];
}

/** Entries per message. The client chunks larger deltas before sending. */
export const MAX_TRANSFORM_ENTRIES = 64;
/** Object ids are Studio ids or runtime ids; both are short. */
export const MAX_ID_LENGTH = 64;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

/** Returns a normalised payload, or null when the message must be dropped. */
export function parseTransformDelta(data: unknown): TransformDeltaPayload | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (!isFiniteNumber(record.tick)) return null;
  if (!Array.isArray(record.entries) || record.entries.length > MAX_TRANSFORM_ENTRIES) return null;

  const entries: TransformDeltaEntry[] = [];
  for (const raw of record.entries) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    if (!isId(entry.id)) return null;
    if (
      !isFiniteNumber(entry.x) ||
      !isFiniteNumber(entry.y) ||
      !isFiniteNumber(entry.z) ||
      !isFiniteNumber(entry.ry)
    ) {
      return null;
    }
    entries.push({ id: entry.id, x: entry.x, y: entry.y, z: entry.z, ry: entry.ry });
  }

  const removedRaw = record.removed ?? [];
  if (!Array.isArray(removedRaw) || removedRaw.length > MAX_TRANSFORM_ENTRIES) return null;
  const removed: string[] = [];
  for (const raw of removedRaw) {
    if (!isId(raw)) return null;
    removed.push(raw);
  }

  return { tick: record.tick, entries, removed };
}
