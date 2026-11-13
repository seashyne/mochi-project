// Progressive object streaming for a chunk payload.
//
// A chunk payload is `{"chunkId":"...","objects":[ ... ]}`. Waiting for the whole
// file means a multi-megabyte chunk shows nothing until the last byte arrives; this
// module hands back objects as their bytes complete, so a slow connection fills the
// world in progressively instead of all at once.
//
// Finding element boundaries means walking the JSON while tracking strings and
// escapes, which is an O(n) byte scan - that part runs in the kernel. The
// TypeScript reference below is the fallback and the parity target.

import { getWasmKernel } from '../physics/wasmPhysics';

/** Element ranges requested per kernel call. */
export const SCAN_BATCH = 256;
/** Bytes of the head searched for `chunkId` and the objects array. */
export const HEADER_SEARCH_BYTES = 4096;

export interface JsonRange {
  offset: number;
  length: number;
}

export interface StreamChunkOptions {
  signal?: AbortSignal;
  /** Objects handed back per yield. Defaults to 48. */
  batchSize?: number;
  /**
   * Bytes of object payload that also trigger a yield. Without this a chunk of a
   * few heavy objects would wait for the object count to fill, which on a large
   * payload is most of the download - the exact wait streaming exists to remove.
   */
  batchBytes?: number;
  /** Expected `chunkId`; a mismatch aborts before anything is handed back. */
  expectedChunkId?: string;
  /** Hard stop, so a corrupt payload cannot stream forever. */
  maxObjects?: number;
  /**
   * Receives the complete payload once the stream ends, so the caller can put it in
   * the asset cache. Streaming otherwise bypasses the cache and every visit would
   * re-download the chunk.
   */
  onComplete?: (bytes: Uint8Array) => void;
}

/** Objects per yield when only the count is bounded. */
export const DEFAULT_BATCH_OBJECTS = 48;
/** Bytes per yield when objects are individually heavy. */
export const DEFAULT_BATCH_BYTES = 384 * 1024;

function isJsonSpace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

/** Reference scanner. Same resume rule and same trimming as the kernel. */
export function scanJsonArrayRangesTypeScript(
  bytes: Uint8Array,
  from: number,
  maxRanges = SCAN_BATCH
): JsonRange[] {
  const ranges: JsonRange[] = [];
  if (maxRanges <= 0 || from >= bytes.length) return ranges;

  let cursor = from;
  while (ranges.length < maxRanges) {
    while (cursor < bytes.length && (isJsonSpace(bytes[cursor]) || bytes[cursor] === 0x2c)) {
      cursor += 1;
    }
    if (cursor >= bytes.length || bytes[cursor] === 0x5d) break;

    const start = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    while (cursor < bytes.length) {
      const byte = bytes[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (byte === 0x5c) escaped = true;
        else if (byte === 0x22) inString = false;
      } else if (byte === 0x22) {
        inString = true;
      } else if (byte === 0x7b || byte === 0x5b) {
        depth += 1;
      } else if (byte === 0x7d) {
        if (depth === 0) return ranges;
        depth -= 1;
      } else if (byte === 0x5d) {
        if (depth === 0) {
          end = cursor;
          break;
        }
        depth -= 1;
      } else if (byte === 0x2c && depth === 0) {
        end = cursor;
        break;
      }
      cursor += 1;
    }

    if (end < 0) break;

    let trimmed = end;
    while (trimmed > start && isJsonSpace(bytes[trimmed - 1])) trimmed -= 1;
    if (trimmed > start) ranges.push({ offset: start, length: trimmed - start });
    cursor = end;
  }

  return ranges;
}

/** Scans with the kernel when it is loaded. */
export function scanJsonArrayRanges(
  bytes: Uint8Array,
  from: number,
  maxRanges = SCAN_BATCH
): JsonRange[] {
  const kernel = getWasmKernel();
  if (!kernel || maxRanges <= 0 || from >= bytes.length) {
    return scanJsonArrayRangesTypeScript(bytes, from, maxRanges);
  }

  const byteUnits = Math.max(1, Math.ceil(bytes.length / 4));
  const dataPtr = kernel.alloc_f32_buffer(byteUnits);
  const rangePtr = kernel.alloc_f32_buffer(maxRanges * 2);

  try {
    // Views after every allocation: growing memory detaches earlier buffers.
    new Uint8Array(kernel.memory.buffer, dataPtr, bytes.length).set(bytes);
    const count = kernel.scan_json_array(dataPtr, bytes.length, from, rangePtr, maxRanges);
    if (count === 0) return [];

    const raw = new Uint32Array(kernel.memory.buffer, rangePtr, count * 2);
    const ranges: JsonRange[] = [];
    for (let index = 0; index < count; index += 1) {
      ranges.push({ offset: raw[index * 2], length: raw[index * 2 + 1] });
    }
    return ranges;
  } finally {
    kernel.free_f32_buffer(dataPtr, byteUnits);
    kernel.free_f32_buffer(rangePtr, maxRanges * 2);
  }
}

function findByteSequence(bytes: Uint8Array, needle: string, limit: number): number {
  const target = new TextEncoder().encode(needle);
  const end = Math.min(bytes.length, limit) - target.length;
  for (let start = 0; start <= end; start += 1) {
    let match = true;
    for (let index = 0; index < target.length; index += 1) {
      if (bytes[start + index] !== target[index]) {
        match = false;
        break;
      }
    }
    if (match) return start;
  }
  return -1;
}

/** Byte offset of the first element of the `objects` array, or -1 if not seen yet. */
export function findObjectsArrayStart(bytes: Uint8Array, limit = HEADER_SEARCH_BYTES): number {
  const key = findByteSequence(bytes, '"objects"', limit);
  if (key < 0) return -1;
  let cursor = key + '"objects"'.length;
  while (cursor < bytes.length && isJsonSpace(bytes[cursor])) cursor += 1;
  if (cursor >= bytes.length || bytes[cursor] !== 0x3a) return -1;
  cursor += 1;
  while (cursor < bytes.length && isJsonSpace(bytes[cursor])) cursor += 1;
  if (cursor >= bytes.length || bytes[cursor] !== 0x5b) return -1;
  return cursor;
}

/** `chunkId` from the payload head, or null when it has not arrived yet. */
export function findChunkId(bytes: Uint8Array, limit = HEADER_SEARCH_BYTES): string | null {
  const key = findByteSequence(bytes, '"chunkId"', limit);
  if (key < 0) return null;
  let cursor = key + '"chunkId"'.length;
  while (cursor < bytes.length && isJsonSpace(bytes[cursor])) cursor += 1;
  if (cursor >= bytes.length || bytes[cursor] !== 0x3a) return null;
  cursor += 1;
  while (cursor < bytes.length && isJsonSpace(bytes[cursor])) cursor += 1;
  if (cursor >= bytes.length || bytes[cursor] !== 0x22) return null;
  cursor += 1;

  const start = cursor;
  let escaped = false;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    if (escaped) escaped = false;
    else if (byte === 0x5c) escaped = true;
    else if (byte === 0x22) {
      return new TextDecoder().decode(bytes.subarray(start, cursor));
    }
    cursor += 1;
  }
  return null;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

/**
 * Reads a chunk response and yields its objects in completion order, in batches.
 * Throws when the response carries no body or the payload is not the expected
 * shape; callers fall back to the all-at-once path.
 */
export async function* streamChunkObjects(
  response: Response,
  options: StreamChunkOptions = {}
): AsyncGenerator<unknown[]> {
  const body = response.body;
  if (!body) throw new Error('Chunk response has no readable body');

  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_OBJECTS);
  const batchBytes = Math.max(1, options.batchBytes ?? DEFAULT_BATCH_BYTES);
  const maxObjects = options.maxObjects ?? Number.POSITIVE_INFINITY;
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer: Uint8Array = new Uint8Array(0);
  let scanFrom = -1;
  let parsed = 0;
  let pending: unknown[] = [];
  let pendingBytes = 0;

  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      buffer = concatBytes(buffer, value);

      if (scanFrom < 0) {
        const arrayStart = findObjectsArrayStart(buffer);
        if (arrayStart < 0) continue;
        const chunkId = findChunkId(buffer);
        if (options.expectedChunkId !== undefined && chunkId !== null && chunkId !== options.expectedChunkId) {
          throw new Error(`Chunk payload id ${chunkId} does not match ${options.expectedChunkId}`);
        }
        scanFrom = arrayStart + 1;
      }

      while (parsed < maxObjects) {
        const ranges = scanJsonArrayRanges(buffer, scanFrom);
        if (ranges.length === 0) break;
        for (const range of ranges) {
          const text = decoder.decode(buffer.subarray(range.offset, range.offset + range.length));
          pending.push(JSON.parse(text));
          pendingBytes += range.length;
          parsed += 1;
          if (pending.length >= batchSize || pendingBytes >= batchBytes) {
            yield pending;
            pending = [];
            pendingBytes = 0;
          }
        }
        const last = ranges[ranges.length - 1];
        scanFrom = last.offset + last.length;
      }
      if (parsed >= maxObjects) break;
    }
  } finally {
    reader.releaseLock();
  }

  options.onComplete?.(buffer);
  if (pending.length > 0) yield pending;
}
