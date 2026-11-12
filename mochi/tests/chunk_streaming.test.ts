import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { clearAssetCache } from '../src/engine/assets/assetCache';
import { attachChunkRef, type MochiManifestV2 } from '../src/engine/package/manifestV2';
import { loadChunkedWorld } from '../src/engine/scene/chunkedWorldLoader';
import { ChunkStream } from '../src/engine/scene/chunkStream';
import { attachWorld } from '../src/engine/scene/attachWorld';
import type { WorldLoadResult } from '../src/engine/scene/sceneLoader';
import type { StudioObject } from '../src/engine/studio/types';

const point = (x: number) => ({ x, y: 2, z: 0 });
function fixture(xs = [0, 1000, 2000]) {
  const payloads = new Map<string, string>();
  const refs = xs.map((x, index) => {
    const object: StudioObject = {
      id: `block-${index}`, name: 'Ground', type: 'block', position: point(x),
      rotation: point(0), scale: { x: 20, y: 1, z: 20 }, color: '#123456'
    };
    const payload = { chunkId: `chunk-${index}`, objects: [object] };
    const json = JSON.stringify(payload);
    const url = `https://cdn.test/chunk-${index}.json`;
    payloads.set(url, json);
    return attachChunkRef(payload, {
      url, key: `assets/chunk-${index}`, hash: 'a'.repeat(64),
      sizeBytes: new TextEncoder().encode(json).length, contentType: 'application/json'
    });
  });
  const manifest: MochiManifestV2 = {
    manifestVersion: '2.0', title: 'Demand streaming', version: '1.0.0', spawn: point(0),
    chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 }, chunks: refs
  };
  return { manifest, payloads, refs, scene: new THREE.Scene(), physics: new PhysicsWorld() };
}
function stubFetch(payloads: Map<string, string>) {
  const fetcher = vi.fn(async (url: string) => new Response(payloads.get(url) ?? 'missing', {
    status: payloads.has(url) ? 200 : 404
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function result(): WorldLoadResult {
  return { success: true, ready: Promise.resolve(), objectsCount: 1, spawnPoint: point(0), meshes: [], bodies: [], dispose: vi.fn() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); await clearAssetCache(); });

describe('demand world streaming', () => {
  it('loads only spawn neighbors, moves residency and reuses cached chunks on return', async () => {
    const f = fixture();
    const fetcher = stubFetch(f.payloads);
    const world = await loadChunkedWorld(f.scene, f.manifest, f.physics);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(world.loadedChunkIds).toEqual(['chunk-0']);
    expect(world.chunkCount).toBe(3);
    expect(world.isReadyAt(point(1000))).toBe(false);
    world.update(point(1000));
    expect(f.physics.getBody('physics_block-0')).toBeUndefined();
    await world.whenIdle();
    expect(world.loadedChunkIds).toEqual(['chunk-1']);
    expect(world.isReadyAt(point(1000))).toBe(true);
    expect(world.objectsCount).toBe(1);
    expect(world.bodies).toHaveLength(1);
    expect(f.scene.children).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    world.update(point(0));
    await world.whenIdle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(world.loadedChunkIds).toEqual(['chunk-0']);
    world.dispose();
    expect(f.scene.children).toHaveLength(0);
    expect(f.physics.getAllBodies()).toHaveLength(0);
  });

  it('retains a boundary chunk until the unload radius is crossed', async () => {
    const f = fixture([0]);
    stubFetch(f.payloads);
    const world = await loadChunkedWorld(f.scene, f.manifest, f.physics, { loadRadius: 50, unloadRadius: 100 });
    world.update(point(80));
    expect(world.loadedChunkIds).toHaveLength(1);
    world.update(point(120));
    expect(world.loadedChunkIds).toHaveLength(0);
    world.update(point(80));
    await world.whenIdle();
    expect(world.loadedChunkIds).toHaveLength(0);
    world.update(point(40));
    await world.whenIdle();
    expect(world.loadedChunkIds).toHaveLength(1);
    world.dispose();
  });

  it('disposes successful neighbors when another initial chunk fails', async () => {
    const f = fixture([0, 50]);
    f.payloads.delete(f.refs[1].url);
    stubFetch(f.payloads);
    await expect(loadChunkedWorld(f.scene, f.manifest, f.physics)).rejects.toThrow('404');
    expect(f.scene.children).toHaveLength(0);
    expect(f.physics.getAllBodies()).toHaveLength(0);
  });

  it('rejects mismatched chunk identity and declared object counts', async () => {
    for (const payload of [{ chunkId: 'wrong', objects: [] }, { chunkId: 'chunk-0', objects: [] }]) {
      const f = fixture([0]);
      f.payloads.set(f.refs[0].url, JSON.stringify(payload));
      stubFetch(f.payloads);
      await expect(loadChunkedWorld(f.scene, f.manifest, f.physics)).rejects.toThrow('invalid objects or identity');
      expect(f.scene.children).toHaveLength(0);
      await clearAssetCache();
    }
  });

  it('validates external index bounds before fetching any chunk', async () => {
    const f = fixture([0]);
    const ref = { ...f.refs[0], url: 'https://cdn.test/index.json', sizeBytes: 4096 };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ chunks: [{ ...f.refs[0], bounds: null }] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadChunkedWorld(f.scene, { ...f.manifest, chunks: undefined, chunkIndex: ref }, f.physics)).rejects.toThrow('Invalid chunk index');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts an attachment before its initial download can populate the scene', async () => {
    const f = fixture([0]);
    const download = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal!;
      return download.promise;
    }));
    const attachment = attachWorld(f.scene, JSON.stringify(f.manifest), f.physics);
    const ready = expect(attachment.ready).rejects.toThrow();
    await vi.waitFor(() => expect(signal).toBeDefined());
    attachment.dispose();
    expect(signal!.aborted).toBe(true);
    download.resolve(new Response(f.payloads.get(f.refs[0].url)));
    await ready;
    expect(f.scene.children).toHaveLength(0);
    expect(f.physics.getAllBodies()).toHaveLength(0);
    expect(attachment.update(point(0))).toBe(false);
  });

  it('wires player position updates through the world attachment', async () => {
    const f = fixture();
    const fetcher = stubFetch(f.payloads);
    const attachment = attachWorld(f.scene, JSON.stringify(f.manifest), f.physics);
    expect(attachment.update(point(0))).toBe(false);
    await attachment.ready;
    expect(attachment.update(point(0))).toBe(true);
    expect(attachment.update(point(1000))).toBe(false);
    await vi.waitFor(() => expect(attachment.update(point(1000))).toBe(true));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(f.physics.getAllBodies().map(body => body.id)).toEqual(['physics_block-1']);
    attachment.dispose();
  });
});

describe('chunk request scheduling', () => {
  it('caps concurrent requests and coalesces repeated updates', async () => {
    const { refs } = fixture([0, 10, 20]);
    const requests: Array<ReturnType<typeof deferred<WorldLoadResult>>> = [];
    const load = vi.fn(() => { const request = deferred<WorldLoadResult>(); requests.push(request); return request.promise; });
    const stream = new ChunkStream(refs, load, { concurrency: 2 });
    stream.update(point(0));
    stream.update(point(0));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[0].resolve(result());
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[1].resolve(result()); requests[2].resolve(result());
    await stream.whenIdle();
    expect(load).toHaveBeenCalledTimes(3);
    expect(stream.loadedChunkIds).toHaveLength(3);
    stream.dispose();
  });

  it('disposes late results after a focus change and after shutdown', async () => {
    const { refs } = fixture([0, 1000]);
    const first = deferred<WorldLoadResult>();
    const last = deferred<WorldLoadResult>();
    const signals: AbortSignal[] = [];
    const stream = new ChunkStream(refs, (ref, signal) => {
      signals.push(signal);
      return ref.id === refs[0].id ? first.promise : last.promise;
    }, { concurrency: 1 });
    stream.update(point(0));
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    stream.update(point(1000));
    expect(signals[0].aborted).toBe(true);
    const stale = result(); first.resolve(stale);
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    expect(stale.dispose).toHaveBeenCalledOnce();
    stream.dispose();
    const late = result(); last.resolve(late);
    await stream.whenIdle();
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(stream.loadedChunkIds).toHaveLength(0);
  });

  it('enforces both byte and chunk residency budgets', async () => {
    const { refs } = fixture([0, 20, 40]);
    for (const options of [{ maxResidentChunks: 1 }, { maxResidentBytes: refs[0].sizeBytes }]) {
      const load = vi.fn(async () => result());
      const stream = new ChunkStream(refs, load, options);
      stream.update(point(0)); await stream.whenIdle();
      expect(stream.loadedChunkIds).toEqual([refs[0].id]);
      expect(stream.residentBytes).toBe(refs[0].sizeBytes);
      stream.dispose();
    }
  });

  it('holds readiness on failure and retries with backoff rather than every frame', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { refs } = fixture([0]);
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(result());
    const stream = new ChunkStream(refs, load);
    stream.update(point(0));
    await expect(stream.whenIdle()).rejects.toThrow('offline');
    expect(stream.isReadyAt(point(0))).toBe(false);
    stream.update(point(0));
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 3001);
    stream.update(point(0)); await stream.whenIdle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(stream.isReadyAt(point(0))).toBe(true);
    stream.dispose();
  });
});
