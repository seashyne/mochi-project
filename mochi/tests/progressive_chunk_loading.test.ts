// A large chunk must appear progressively: objects reach the scene while the rest
// of the payload is still downloading, not after the last byte.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { initWasmPhysics } from '../src/engine/physics/wasmPhysics';
import { clearAssetCache } from '../src/engine/assets/assetCache';
import { attachChunkRef, type MochiManifestV2 } from '../src/engine/package/manifestV2';
import {
  PROGRESSIVE_CHUNK_MIN_BYTES,
  loadChunkedWorld
} from '../src/engine/scene/chunkedWorldLoader';
import type { StudioObject } from '../src/engine/studio/types';

const OBJECT_COUNT = 120;
const SCRIPT_PADDING = 18_000;

function heavyObjects(): StudioObject[] {
  const script = `-- generated\n${'-- filler line for payload size\n'.repeat(SCRIPT_PADDING / 29)}`;
  return Array.from({ length: OBJECT_COUNT }, (_, index) => ({
    id: `heavy-${index}`,
    name: `Heavy ${index}`,
    type: 'block' as const,
    position: { x: (index % 12) * 4, y: 1, z: Math.floor(index / 12) * 4 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 1, z: 2 },
    color: '#336699',
    luaScript: script
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((done) => setTimeout(done, 5));
  }
}

function splitEvery(bytes: Uint8Array, size: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    parts.push(bytes.subarray(offset, Math.min(bytes.length, offset + size)));
  }
  return parts;
}

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearAssetCache();
});

describe('progressive chunk loading', () => {
  it('mounts objects before the payload has finished downloading', async () => {
    const objects = heavyObjects();
    const json = JSON.stringify({ chunkId: 'heavy-0', objects });
    const bytes = new TextEncoder().encode(json);
    expect(bytes.length).toBeGreaterThan(PROGRESSIVE_CHUNK_MIN_BYTES);

    const url = 'https://cdn.test/heavy-0.json';
    const ref = attachChunkRef({ chunkId: 'heavy-0', objects }, {
      url,
      key: 'assets/heavy-0',
      hash: 'b'.repeat(64),
      sizeBytes: bytes.length,
      contentType: 'application/json'
    });
    const manifest: MochiManifestV2 = {
      manifestVersion: '2.0',
      title: 'Progressive',
      version: '1.0.0',
      spawn: { x: 0, y: 2, z: 0 },
      chunking: { strategy: 'grid', cellSize: 256, objectLimitPerChunk: 200 },
      chunks: [ref]
    };

    // Pause the response part-way through so the assertion runs mid-download.
    const gate = deferred<void>();
    const slices = splitEvery(bytes, 64 * 1024);
    // 768 KB in: past the 384 KB flush ceiling, so a batch must already be mounted.
    const pauseAfter = 11;

    vi.stubGlobal('fetch', vi.fn(async () => {
      let cursor = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (cursor >= slices.length) {
            controller.close();
            return;
          }
          const slice = slices[cursor];
          const shouldPause = cursor === pauseAfter;
          cursor += 1;
          controller.enqueue(slice);
          if (shouldPause) await gate.promise;
        }
      });
      return new Response(body, { status: 200 });
    }));

    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const loading = loadChunkedWorld(scene, manifest, physics);

    await waitFor(() => scene.children.length > 0);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(physics.getAllBodies().length).toBeGreaterThan(0);
    expect(physics.getAllBodies().length).toBeLessThan(OBJECT_COUNT);

    gate.resolve();
    const world = await loading;

    expect(world.objectsCount).toBe(OBJECT_COUNT);
    expect(world.bodies).toHaveLength(OBJECT_COUNT);
    expect(world.bindings.size).toBe(OBJECT_COUNT);
    expect(world.loadedChunkIds).toEqual(['heavy-0']);
  });

  it('leaves a small chunk on the all-at-once path', async () => {
    const objects: StudioObject[] = [{
      id: 'light-0', name: 'Light', type: 'block',
      position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 4, y: 1, z: 4 }, color: '#123456'
    }];
    const json = JSON.stringify({ chunkId: 'light-0', objects });
    const url = 'https://cdn.test/light-0.json';
    const ref = attachChunkRef({ chunkId: 'light-0', objects }, {
      url, key: 'assets/light-0', hash: 'c'.repeat(64),
      sizeBytes: new TextEncoder().encode(json).length,
      contentType: 'application/json'
    });

    const fetcher = vi.fn(async () => new Response(json, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const scene = new THREE.Scene();
    const world = await loadChunkedWorld(
      scene,
      {
        manifestVersion: '2.0', title: 'Small', version: '1.0.0',
        spawn: { x: 0, y: 2, z: 0 },
        chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 },
        chunks: [ref]
      },
      new PhysicsWorld()
    );

    expect(world.objectsCount).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
