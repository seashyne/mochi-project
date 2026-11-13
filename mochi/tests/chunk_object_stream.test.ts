// Progressive chunk streaming: the kernel's JSON array scanner against the
// TypeScript reference, and the reader that hands objects back as bytes arrive.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics } from '../src/engine/physics/wasmPhysics';
import {
  findChunkId,
  findObjectsArrayStart,
  scanJsonArrayRanges,
  scanJsonArrayRangesTypeScript,
  streamChunkObjects
} from '../src/engine/scene/chunkObjectStream';

const encoder = new TextEncoder();

/** Payload with the characters that break naive scanners: separators inside strings. */
const OBJECTS = [
  { id: 'a', name: 'comma, bracket ] and brace }', scale: { x: 1, y: 2, z: 3 } },
  { id: 'b', name: 'escaped \\" quote and \\\\ backslash', nested: { deep: [1, 2, { three: 3 }] } },
  // Astral-plane character built at runtime: 4-byte UTF-8 without a literal emoji.
  { id: 'c', name: `unicode ไทย 日本語 ${String.fromCodePoint(0x20000)}`, value: -0.5 },
  { id: 'd', name: '', empty: [], nothing: null, flag: true },
  { id: 'e', name: 'trailing spaces   ' }
];

function payloadBytes(chunkId = 'c_1_2_0'): Uint8Array {
  return encoder.encode(JSON.stringify({ chunkId, objects: OBJECTS }));
}

function splitEvery(bytes: Uint8Array, size: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    parts.push(bytes.subarray(offset, Math.min(bytes.length, offset + size)));
  }
  return parts;
}

function responseFromChunks(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
  return new Response(stream);
}

async function collect(response: Response, options: Parameters<typeof streamChunkObjects>[1] = {}) {
  const batches: unknown[][] = [];
  for await (const batch of streamChunkObjects(response, options)) batches.push(batch);
  return batches;
}

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
});

describe('json array scanner', () => {
  it('agrees with the TypeScript reference on hostile strings', () => {
    const bytes = payloadBytes();
    const start = findObjectsArrayStart(bytes);
    expect(start).toBeGreaterThan(0);

    const fromKernel = scanJsonArrayRanges(bytes, start + 1);
    const fromReference = scanJsonArrayRangesTypeScript(bytes, start + 1);
    expect(fromKernel).toEqual(fromReference);
    expect(fromKernel).toHaveLength(OBJECTS.length);
  });

  it('returns ranges that parse back to the original objects', () => {
    const bytes = payloadBytes();
    const start = findObjectsArrayStart(bytes);
    const ranges = scanJsonArrayRanges(bytes, start + 1);
    const decoder = new TextDecoder();

    const parsed = ranges.map((range) =>
      JSON.parse(decoder.decode(bytes.subarray(range.offset, range.offset + range.length)))
    );
    expect(parsed).toEqual(OBJECTS);
  });

  it('stops at the last complete element of a truncated payload', () => {
    const bytes = payloadBytes();
    const start = findObjectsArrayStart(bytes);
    // Cut inside the fourth object, so three are complete and one is not.
    const cut = bytes.subarray(0, Math.floor(bytes.length * 0.75));
    const ranges = scanJsonArrayRanges(cut, start + 1);
    const reference = scanJsonArrayRangesTypeScript(cut, start + 1);

    expect(ranges).toEqual(reference);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.length).toBeLessThan(OBJECTS.length);
  });

  it('resumes from the last range without repeating or skipping', () => {
    const bytes = payloadBytes();
    const start = findObjectsArrayStart(bytes);

    const first = scanJsonArrayRanges(bytes, start + 1, 2);
    expect(first).toHaveLength(2);
    const last = first[first.length - 1];
    const rest = scanJsonArrayRanges(bytes, last.offset + last.length);

    expect([...first, ...rest]).toEqual(scanJsonArrayRanges(bytes, start + 1));
  });

  it('reads an empty array as no elements', () => {
    const bytes = encoder.encode('{"chunkId":"x","objects":[]}');
    const start = findObjectsArrayStart(bytes);
    expect(start).toBeGreaterThan(0);
    expect(scanJsonArrayRanges(bytes, start + 1)).toEqual([]);
    expect(scanJsonArrayRangesTypeScript(bytes, start + 1)).toEqual([]);
  });
});

describe('payload header', () => {
  it('finds the objects array and the chunk id', () => {
    const bytes = payloadBytes('c_7_8_3');
    expect(findObjectsArrayStart(bytes)).toBeGreaterThan(0);
    expect(findChunkId(bytes)).toBe('c_7_8_3');
  });

  it('reports nothing until the header has arrived', () => {
    const bytes = payloadBytes();
    const head = bytes.subarray(0, 8);
    expect(findObjectsArrayStart(head)).toBe(-1);
    expect(findChunkId(head)).toBeNull();
  });
});

describe('streamChunkObjects', () => {
  it('yields every object in order when the payload is cut mid-token', async () => {
    const bytes = payloadBytes();
    // Seven-byte slices put boundaries inside strings, escapes and numbers.
    const batches = await collect(responseFromChunks(splitEvery(bytes, 7)), { batchSize: 2 });

    expect(batches.flat()).toEqual(OBJECTS);
    expect(batches.every((batch) => batch.length <= 2)).toBe(true);
    expect(batches.length).toBeGreaterThan(1);
  });

  it('yields a single batch when the whole payload arrives at once', async () => {
    const batches = await collect(responseFromChunks([payloadBytes()]));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(OBJECTS);
  });

  it('hands the complete payload to onComplete so it can be cached', async () => {
    const bytes = payloadBytes();
    let captured: Uint8Array | null = null;
    await collect(responseFromChunks(splitEvery(bytes, 13)), {
      onComplete: (payload) => { captured = payload; }
    });

    expect(captured).not.toBeNull();
    const decoded = JSON.parse(new TextDecoder().decode(captured!));
    expect(decoded.chunkId).toBe('c_1_2_0');
    expect(decoded.objects).toEqual(OBJECTS);
  });

  it('refuses a payload whose chunk id does not match', async () => {
    const response = responseFromChunks([payloadBytes('c_wrong')]);
    await expect(collect(response, { expectedChunkId: 'c_1_2_0' })).rejects.toThrow(
      /does not match/
    );
  });

  it('stops at maxObjects', async () => {
    const batches = await collect(responseFromChunks(splitEvery(payloadBytes(), 11)), {
      maxObjects: 2,
      batchSize: 1
    });
    expect(batches.flat()).toHaveLength(2);
  });

  it('rejects a response with no body', async () => {
    const response = new Response(null);
    await expect(collect(response)).rejects.toThrow(/no readable body/);
  });
});
