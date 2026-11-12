// Manifest v2 chunking, validation, and streaming loader tests

import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearAssetCache } from '../src/engine/assets/assetCache';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { StudioObject } from '../src/engine/studio/types';
import {
  ManifestChunkRef,
  MochiManifestV2,
  attachChunkRef,
  buildChunkedWorld,
  isManifestV2,
  serializeChunkPayload,
  validateManifestV2
} from '../src/engine/package/manifestV2';
import {
  loadChunkedWorld,
  parseChunkedManifest
} from '../src/engine/scene/chunkedWorldLoader';

const HASH = 'a'.repeat(64);

function makeObject(id: string, x: number, z: number): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x, y: 1, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    color: '#6366f1'
  };
}

function makeRef(id: string, url = `https://cdn.test/${id}.json`, objectCount = 1): ManifestChunkRef {
  return {
    id,
    hash: HASH,
    key: `assets/sha256/${HASH}`,
    url,
    sizeBytes: 4096,
    contentType: 'application/json',
    objectCount,
    bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } }
  };
}

function makeManifest(overrides: Partial<MochiManifestV2> = {}): MochiManifestV2 {
  return {
    manifestVersion: '2.0',
    title: 'Chunked World',
    version: '1.0.0',
    chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 },
    chunks: [makeRef('c_0_0_0')],
    ...overrides
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearAssetCache();
});

describe('manifest v2 world chunking', () => {
  it('groups objects into grid cells and splits at the per-chunk budget', () => {
    const world = buildChunkedWorld(
      [makeObject('a', 1, 1), makeObject('b', 2, 2), makeObject('c', 3, 3), makeObject('d', 100, 100)],
      { cellSize: 64, objectLimitPerChunk: 2 }
    );

    expect(world.chunking).toEqual({
      strategy: 'grid',
      cellSize: 64,
      objectLimitPerChunk: 2
    });
    expect(world.chunks).toHaveLength(3);
    expect(world.chunks[0].objects).toHaveLength(2);
    expect(world.chunks[1].objects).toHaveLength(1);
    expect(world.chunks[2].objects).toHaveLength(1);
    expect(world.chunks[2].chunkId.startsWith('c_1_1')).toBe(true);
  });

  it('derives spawn from the spawn object and computes chunk bounds', () => {
    const spawn: StudioObject = {
      ...makeObject('spawn', 4, -8),
      type: 'spawn',
      scale: { x: 2, y: 2, z: 2 }
    };
    const world = buildChunkedWorld([spawn, makeObject('block', 10, 0)]);

    expect(world.spawn).toEqual({ x: 4, y: 3, z: -8 });
    const ref = attachChunkRef(world.chunks[0], {
      hash: HASH,
      key: `assets/sha256/${HASH}`,
      url: 'https://cdn.test/chunk.json',
      sizeBytes: 128,
      contentType: 'application/json'
    });
    expect(ref.id).toBe(world.chunks[0].chunkId);
    expect(ref.objectCount).toBe(world.chunks[0].objects.length);
    expect(ref.bounds.min.x).toBeLessThanOrEqual(ref.bounds.max.x);
  });

  it('serializes chunk payloads as JSON blobs', async () => {
    const payload = { chunkId: 'c_0_0_0', objects: [makeObject('a', 0, 0)] };
    const blob = serializeChunkPayload(payload);
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual(payload);
  });
});

describe('manifest v2 validation', () => {
  it('accepts a well-formed inline chunk manifest', () => {
    expect(validateManifestV2(makeManifest())).toEqual([]);
    expect(isManifestV2(makeManifest())).toBe(true);
  });

  it('rejects missing chunks, bad bounds, and duplicate ids', () => {
    const errors = validateManifestV2(
      makeManifest({
        chunks: [
          makeRef('dup'),
          { ...makeRef('dup'), bounds: { min: { x: 5, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }
        ]
      })
    );
    expect(errors.some((e) => e.includes('duplicated'))).toBe(true);
    expect(errors.some((e) => e.includes('min must not exceed max'))).toBe(true);

    expect(validateManifestV2(makeManifest({ chunks: [] }))).toContain(
      'manifest must include chunks or a chunkIndex reference'
    );
  });

  it('rejects non-v2 documents and parses v2 manifests only', () => {
    expect(validateManifestV2({ objects: [] })).toEqual(['manifestVersion must be "2.0"']);
    expect(parseChunkedManifest(JSON.stringify({ objects: [] }))).toBeNull();
    expect(parseChunkedManifest(JSON.stringify(makeManifest()))?.title).toBe('Chunked World');
  });
});

describe('chunked world loader', () => {
  it('downloads chunk payloads concurrently and merges them into the scene', async () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const payloads: Record<string, unknown> = {
      'https://cdn.test/a.json': { chunkId: 'a', objects: [makeObject('a1', 0, 0), makeObject('a2', 2, 0)] },
      'https://cdn.test/b.json': { chunkId: 'b', objects: [makeObject('b1', 100, 100)] }
    };
    const fetchMock = vi.fn(async (url: string) => {
      const body = payloads[url];
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const progress: Array<[number, number]> = [];
    const result = await loadChunkedWorld(
      scene,
      makeManifest({
        spawn: { x: 1, y: 2, z: 3 },
        chunks: [makeRef('a', 'https://cdn.test/a.json', 2), makeRef('b', 'https://cdn.test/b.json', 1)]
      }),
      physics,
      { concurrency: 2, onProgress: (done, total) => progress.push([done, total]) }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.chunkCount).toBe(2);
    expect(result.objectsCount).toBe(3);
    expect(result.spawnPoint).toEqual({ x: 1, y: 2, z: 3 });
    expect(scene.children.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual([2, 2]);

    result.dispose();
    expect(scene.children).toHaveLength(0);
    expect(physics.getAllBodies()).toHaveLength(0);
  });

  it('resolves an external chunk index before downloading chunks', async () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const indexRef = {
      hash: HASH,
      key: `assets/sha256/${HASH}`,
      url: 'https://cdn.test/index.json',
      sizeBytes: 4096,
      contentType: 'application/json'
    };
    const index = {
      chunks: [makeRef('a', 'https://cdn.test/a.json', 1)]
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === indexRef.url) return new Response(JSON.stringify(index), { status: 200 });
      return new Response(
        JSON.stringify({ chunkId: 'a', objects: [makeObject('a1', 0, 0)] }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const manifest = makeManifest({ chunks: undefined, chunkIndex: indexRef });
    const result = await loadChunkedWorld(scene, manifest, physics);

    expect(fetchMock).toHaveBeenCalledWith(indexRef.url, expect.objectContaining({ signal: undefined }));
    expect(result.chunkCount).toBe(1);
    expect(result.objectsCount).toBe(1);
    result.dispose();
  });

  it('rejects invalid v2 manifests before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadChunkedWorld(new THREE.Scene(), makeManifest({ chunks: [] }), new PhysicsWorld())
    ).rejects.toThrow(/Invalid manifest v2/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
