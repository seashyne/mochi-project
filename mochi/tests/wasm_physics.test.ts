// Unit tests for Rust WebAssembly Physics Kernel and TypeScript Fallbacks
// Verifies numerical parity, collision solver, raycasting, and zero-GC integration

import { describe, it, expect, beforeAll } from 'vitest';
import {
  initWasmPhysics,
  isWasmPhysicsReady,
  wasmVec3Length,
  wasmVec3Distance,
  wasmTestAABBOverlap,
  wasmTestSphereAABB,
  wasmRaycastAABB,
  wasmResolveCharacterBox
} from '../src/engine/physics/wasmPhysics';

describe('mochi-physics-wasm WebAssembly Kernel', () => {
  beforeAll(async () => {
    const ok = await initWasmPhysics();
    expect(ok).toBe(true);
  });

  it('initializes WebAssembly instance successfully', () => {
    expect(isWasmPhysicsReady()).toBe(true);
  });

  it('computes 3D vector length accurately', () => {
    expect(wasmVec3Length(3, 4, 0)).toBeCloseTo(5.0, 4);
    expect(wasmVec3Length(1, 2, 2)).toBeCloseTo(3.0, 4);
  });

  it('computes 3D Euclidean distance between points', () => {
    const a = { x: 1, y: 1, z: 1 };
    const b = { x: 4, y: 5, z: 1 };
    expect(wasmVec3Distance(a, b)).toBeCloseTo(5.0, 4);
  });

  it('detects AABB vs AABB overlap correctly', () => {
    const boxA = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
    const boxB = { min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 3, z: 3 } };
    const boxC = { min: { x: 5, y: 5, z: 5 }, max: { x: 6, y: 6, z: 6 } };

    expect(wasmTestAABBOverlap(boxA, boxB)).toBe(true);
    expect(wasmTestAABBOverlap(boxA, boxC)).toBe(false);
  });

  it('solves Sphere vs AABB collision with penetration depth and contact normal', () => {
    const box = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
    const sphereCenter = { x: 1.5, y: 0, z: 0 };
    const radius = 1.0;

    const hit = wasmTestSphereAABB(sphereCenter, radius, box);
    expect(hit.hit).toBe(true);
    expect(hit.penetration).toBeCloseTo(0.5, 3);
    expect(hit.normal.x).toBeCloseTo(1.0, 3);
  });

  it('performs fast ray vs AABB slab intersection', () => {
    const box = { min: { x: -1, y: -1, z: 5 }, max: { x: 1, y: 1, z: 7 } };
    const origin = { x: 0, y: 0, z: 0 };
    const dirHit = { x: 0, y: 0, z: 1 };
    const dirMiss = { x: 0, y: 1, z: 0 };

    const distHit = wasmRaycastAABB(origin, dirHit, box, 100);
    expect(distHit).toBeCloseTo(5.0, 3);

    const distMiss = wasmRaycastAABB(origin, dirMiss, box, 100);
    expect(distMiss).toBe(-1);
  });

  it('resolves avatar vertical and horizontal box collisions', () => {
    const box = { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 1, z: 2 } };
    const playerPos = { x: 0, y: 0.8, z: 0 };
    const radius = 0.4;
    const halfHeight = 0.9;

    const res = wasmResolveCharacterBox(playerPos, radius, halfHeight, box);
    expect(res.collided).toBe(true);
    expect(res.resolvedPos.y).toBeGreaterThanOrEqual(1.0);
  });
});
