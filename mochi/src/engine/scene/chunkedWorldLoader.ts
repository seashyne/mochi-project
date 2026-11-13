import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import { isManifestV2, validateManifestV2, ManifestChunkRef, MochiManifestV2 } from '../package/manifestV2';
import type { StudioVec3 } from '../studio/types';
import { loadWorldFromManifest, WorldLoadResult } from './sceneLoader';
import { mergeBindings } from './sceneBindings';
import { fetchAssetJson, readCachedAsset, writeCachedAsset } from '../assets/assetCache';
import { ChunkStream, type ChunkStreamOptions } from './chunkStream';
import { streamChunkObjects } from './chunkObjectStream';

export interface ChunkedWorldLoadResult extends WorldLoadResult {
  chunkCount: number;
  readonly loadedChunkIds: string[];
  readonly residentBytes: number;
  update: (position: StudioVec3) => void;
  isReadyAt: (position: StudioVec3) => boolean;
  whenIdle: () => Promise<void>;
}

export interface ChunkedLoadOptions extends ChunkStreamOptions {
  signal?: AbortSignal;
}

const MAX_INDEX_BYTES = 4 * 1024 * 1024;
/** Chunks below this size load in one piece; streaming would only add overhead. */
export const PROGRESSIVE_CHUNK_MIN_BYTES = 2 * 1024 * 1024;
/**
 * Objects mounted per progressive batch. Bigger batches mean fewer draw calls, but
 * a batch of heavy objects would also mean waiting for most of the download before
 * anything appears, so the byte ceiling below flushes first when objects are large.
 */
export const PROGRESSIVE_BATCH_SIZE = 64;
/** Payload bytes that force a flush regardless of the object count. */
export const PROGRESSIVE_BATCH_BYTES = 384 * 1024;

function disposeAll(results: WorldLoadResult[]): void {
  for (const result of results) result.dispose();
}

/**
 * Mounts a chunk's objects as their bytes arrive. Returns null - without having
 * touched the scene - when streaming is not available, so the caller can fall back
 * to the all-at-once path.
 *
 * Each batch becomes its own `loadWorldFromManifest` call, which is what makes the
 * world appear progressively; the cost is one instanced batch set per partial
 * instead of one per chunk, which is why the batch size is generous.
 */
async function loadChunkProgressively(
  scene: THREE.Scene,
  ref: ManifestChunkRef,
  physicsWorld: PhysicsWorld,
  signal: AbortSignal
): Promise<WorldLoadResult | null> {
  let response: Response;
  try {
    response = await fetch(ref.url, { signal });
  } catch {
    signal.throwIfAborted();
    return null;
  }
  if (!response.ok || !response.body) return null;

  const partials: WorldLoadResult[] = [];
  const pending: Promise<void>[] = [];
  let mounted = 0;

  try {
    for await (const batch of streamChunkObjects(response, {
      signal,
      batchSize: PROGRESSIVE_BATCH_SIZE,
      batchBytes: PROGRESSIVE_BATCH_BYTES,
      expectedChunkId: ref.id,
      maxObjects: ref.objectCount,
      onComplete: (bytes) => {
        // Streaming bypasses the asset cache, so put the payload back in it or every
        // visit would re-download the chunk. The copy gives the Blob a plain
        // ArrayBuffer, which its typings require.
        const copy = new Uint8Array(bytes.length);
        copy.set(bytes);
        void writeCachedAsset(ref.url, new Blob([copy], { type: 'application/json' }))
          .catch(() => {});
      }
    })) {
      signal.throwIfAborted();
      if (mounted + batch.length > ref.objectCount) {
        throw new Error(`Chunk ${ref.id} streamed more objects than declared`);
      }
      const result = loadWorldFromManifest(scene, batch, physicsWorld);
      partials.push(result);
      pending.push(result.ready);
      mounted += batch.length;
    }
  } catch (error) {
    disposeAll(partials);
    throw error;
  }

  if (mounted !== ref.objectCount) {
    disposeAll(partials);
    throw new Error(`Chunk ${ref.id} streamed ${mounted} of ${ref.objectCount} objects`);
  }

  return {
    success: true,
    objectsCount: mounted,
    spawnPoint: partials[0]?.spawnPoint ?? { x: 0, y: 1, z: 0 },
    get objects() { return partials.flatMap((result) => result.objects); },
    get meshes() { return partials.flatMap((result) => result.meshes); },
    get bodies() { return partials.flatMap((result) => result.bodies); },
    get bindings() { return mergeBindings(...partials.map((result) => result.bindings)); },
    ready: Promise.all(pending).then(() => undefined),
    dispose: () => disposeAll(partials)
  };
}

async function resolveChunkRefs(manifest: MochiManifestV2, signal?: AbortSignal): Promise<ManifestChunkRef[]> {
  if (manifest.chunks?.length) return manifest.chunks;
  const ref = manifest.chunkIndex!;
  if (ref.sizeBytes > MAX_INDEX_BYTES) throw new Error('Chunk index exceeds download byte limit');
  const index = await fetchAssetJson<unknown>(ref.url, { signal }, ref.sizeBytes);
  const chunks = Array.isArray(index) ? index : (index as { chunks?: unknown } | null)?.chunks;
  const expanded = { ...manifest, chunkIndex: undefined, chunks };
  const errors = validateManifestV2(expanded);
  if (errors.length) throw new Error(`Invalid chunk index: ${errors.join('; ')}`);
  return chunks as ManifestChunkRef[];
}

export function parseChunkedManifest(raw: string | unknown): MochiManifestV2 | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  return isManifestV2(parsed) ? parsed : null;
}

export async function loadChunkedWorld(
  scene: THREE.Scene,
  manifest: MochiManifestV2,
  physicsWorld: PhysicsWorld,
  options: ChunkedLoadOptions = {}
): Promise<ChunkedWorldLoadResult> {
  const errors = validateManifestV2(manifest);
  if (errors.length) throw new Error(`Invalid manifest v2: ${errors.join('; ')}`);
  options.signal?.throwIfAborted();
  const refs = await resolveChunkRefs(manifest, options.signal);
  options.signal?.throwIfAborted();
  const spawnPoint = manifest.spawn ?? { x: 0, y: 1, z: 0 };
  const stream = new ChunkStream(refs, async (ref, signal) => {
    signal.throwIfAborted();
    // A cached chunk is already local, so streaming it would only add overhead;
    // a large uncached one is exactly where progressive mounting pays.
    if (ref.sizeBytes >= PROGRESSIVE_CHUNK_MIN_BYTES) {
      const cached = await readCachedAsset(ref.url).catch(() => null);
      if (!cached) {
        const streamed = await loadChunkProgressively(scene, ref, physicsWorld, signal);
        if (streamed) return streamed;
      }
    }
    const payload = await fetchAssetJson<{ chunkId?: string; objects?: unknown[] }>(ref.url, { signal }, ref.sizeBytes);
    signal.throwIfAborted();
    if (!payload || !Array.isArray(payload.objects) || payload.objects.length !== ref.objectCount || payload.chunkId !== ref.id) {
      throw new Error(`Chunk ${ref.id} has invalid objects or identity`);
    }
    const result = loadWorldFromManifest(scene, payload.objects, physicsWorld);
    let onAbort = () => {};
    try {
      await new Promise<void>((resolve, reject) => {
        onAbort = () => { result.dispose(); reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        result.ready.then(resolve, reject);
        if (signal.aborted) onAbort();
      });
      signal.throwIfAborted();
      return result;
    } catch (error) {
      result.dispose();
      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }, {
    ...options,
    loadRadius: options.loadRadius ?? manifest.chunking.cellSize * 2,
    unloadRadius: options.unloadRadius ?? manifest.chunking.cellSize * 3
  });
  const abort = () => stream.dispose();
  options.signal?.addEventListener('abort', abort, { once: true });
  const dispose = () => {
    options.signal?.removeEventListener('abort', abort);
    stream.dispose();
  };
  try {
    stream.update(spawnPoint);
    await stream.whenIdle();
    options.signal?.throwIfAborted();
    if (!stream.isReadyAt(spawnPoint)) throw new Error('Spawn chunks exceed the resident world budget');
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    success: true,
    ready: Promise.resolve(),
    spawnPoint,
    chunkCount: refs.length,
    get loadedChunkIds() { return stream.loadedChunkIds; },
    get residentBytes() { return stream.residentBytes; },
    get objectsCount() { return stream.results.reduce((sum, result) => sum + result.objectsCount, 0); },
    get objects() { return stream.results.flatMap(result => result.objects); },
    get meshes() { return stream.results.flatMap(result => result.meshes); },
    get bodies() { return stream.results.flatMap(result => result.bodies); },
    get bindings() { return mergeBindings(...stream.results.map(result => result.bindings)); },
    update: point => stream.update(point),
    isReadyAt: point => stream.isReadyAt(point),
    whenIdle: () => stream.whenIdle(),
    dispose
  };
}
