// Scale verification for the multi-GB roadmap: a 4096-chunk world must stream
// only the player's neighborhood, and physics must stay within frame budget
// with thousands of resident bodies.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CollisionDetector, PhysicsWorld, RigidBody } from '../src/engine/physics';
import { clearAssetCache } from '../src/engine/assets/assetCache';
import { attachChunkRef, type MochiManifestV2 } from '../src/engine/package/manifestV2';
import { loadChunkedWorld } from '../src/engine/scene/chunkedWorldLoader';
import { chunkDistance } from '../src/engine/scene/chunkStream';

afterEach(async () => { vi.unstubAllGlobals(); await clearAssetCache(); });

describe('world scale', () => {
  it('streams a 4096-chunk world with bounded residency along a long path', async () => {
    const GRID = 64;
    const CELL = 64;
    const payloads = new Map<string, string>();
    const refs = [];
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = i * CELL, z = j * CELL;
        const payload = {
          chunkId: `c${i}-${j}`,
          objects: [{
            id: `g${i}-${j}`, name: 'Ground', type: 'block',
            position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 20, y: 1, z: 20 }, color: '#234567'
          }]
        };
        const json = JSON.stringify(payload);
        const url = `https://cdn.test/scale/c${i}-${j}.json`;
        payloads.set(url, json);
        refs.push(attachChunkRef(payload, {
          url, key: `assets/scale/c${i}-${j}`, hash: 'c'.repeat(64),
          sizeBytes: new TextEncoder().encode(json).length, contentType: 'application/json'
        }));
      }
    }
    const manifest: MochiManifestV2 = {
      manifestVersion: '2.0', title: 'Scale world', version: '1.0.0',
      spawn: { x: 0, y: 2, z: 0 },
      chunking: { strategy: 'grid', cellSize: CELL, objectLimitPerChunk: 200 },
      chunks: refs
    };
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = payloads.get(String(url));
      if (body) fetched.push(String(url));
      return new Response(body ?? 'missing', { status: body ? 200 : 404 });
    }));

    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const started = performance.now();
    const world = await loadChunkedWorld(scene, manifest, physics);
    expect(world.chunkCount).toBe(4096);
    expect(world.loadedChunkIds.length).toBeLessThanOrEqual(32);

    const path: { x: number; y: number; z: number }[] = [];
    let maxResident = 0;
    let maxBytes = 0;
    for (let step = 0; step <= 150; step++) {
      const t = step / 150;
      const point = { x: t * 4000, y: 2, z: t * 4000 + Math.sin(t * 12) * 90 };
      path.push(point);
      world.update(point);
      await world.whenIdle();
      maxResident = Math.max(maxResident, world.loadedChunkIds.length);
      maxBytes = Math.max(maxBytes, world.residentBytes);
      expect(world.isReadyAt(point)).toBe(true);
    }
    const elapsed = performance.now() - started;

    expect(fetched.length).toBeLessThan(1500);
    expect(fetched.length).toBeLessThan(refs.length / 2);
    expect(maxResident).toBeLessThanOrEqual(32);
    expect(maxBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    const byUrl = new Map(refs.map(ref => [ref.url, ref]));
    for (const url of fetched) {
      const ref = byUrl.get(url)!;
      const nearest = Math.min(...path.map(point => chunkDistance(ref, point)));
      expect(nearest).toBeLessThanOrEqual(128);
    }
    world.dispose();
    expect(scene.children).toHaveLength(0);
    expect(physics.getAllBodies()).toHaveLength(0);
    console.info(`[scale] 4096 chunks, 151 path points: ${fetched.length} fetches, maxResident=${maxResident}, ${elapsed.toFixed(0)}ms`);
  }, 60000);

  it('steps 4000+ bodies within frame budget and lands dynamic bodies', () => {
    const world = new PhysicsWorld();
    const SIDE = 63;
    for (let i = 0; i < SIDE; i++) {
      for (let j = 0; j < SIDE; j++) {
        world.addBody(new RigidBody({
          id: `g${i}-${j}`, type: 'static',
          position: { x: i * 24, y: 0, z: j * 24 },
          shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } }
        }));
      }
    }
    const spheres: RigidBody[] = [];
    for (let i = 0; i < 60; i++) {
      const sphere = new RigidBody({
        id: `d${i}`, type: 'dynamic',
        position: { x: (i % 10) * 24 + 2, y: 3, z: Math.floor(i / 10) * 24 + 2 },
        shape: { type: 'sphere', radius: 0.5 },
        material: { restitution: 0, friction: 0.5 }
      });
      spheres.push(sphere);
      world.addBody(sphere);
    }
    const bodyCount = world.getAllBodies().length;
    world.step(1 / 60); // Warm up JIT and grid allocations.

    const spy = vi.spyOn(CollisionDetector, 'testCollision');
    const started = performance.now();
    const STEPS = 30;
    for (let i = 0; i < STEPS; i++) world.step(1 / 60);
    const avgMs = (performance.now() - started) / STEPS;
    const narrowphasePerStep = spy.mock.calls.length / STEPS;
    spy.mockRestore();

    expect(avgMs).toBeLessThan(8);
    for (const sphere of spheres) {
      expect(sphere.position.y).toBeGreaterThan(0.4);
      expect(sphere.position.y).toBeLessThan(1.6);
    }
    const bruteForcePairs = (bodyCount * (bodyCount - 1)) / 2;
    console.info(`[scale] physics ${bodyCount} bodies: ${avgMs.toFixed(2)}ms/step, ${narrowphasePerStep.toFixed(0)} narrowphase/step (brute force ${bruteForcePairs.toLocaleString()} pairs)`);
  }, 30000);
});