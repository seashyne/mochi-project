// Tier 5 adversarial tests: the Rust physics kernel is genuinely built, shipped,
// and wired into the raycast and sphere-box narrowphase paths.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  initWasmPhysics,
  isWasmPhysicsReady,
  wasmRaycastAABB,
  wasmRaycastAABBNormal,
  wasmTestSphereAABB
} from '../src/engine/physics/wasmPhysics';
import { slabRaycast } from '../src/engine/physics/raycastAABB';
import { CollisionDetector } from '../src/engine/physics/collision';
import { RigidBody } from '../src/engine/physics/body';
import type { AABB } from '../src/engine/physics/types';

const BOX: AABB = {
  min: { x: -1, y: -1, z: -1 },
  max: { x: 1, y: 1, z: 1 }
};

const EXPECTED_EXPORTS = [
  'alloc_f32_buffer',
  'free_f32_buffer',
  'integrate_body',
  'ray_intersect_aabb',
  'ray_intersect_aabb_normal',
  'resolve_character_box_collision',
  'test_aabb_aabb',
  'test_sphere_aabb',
  'test_sphere_sphere',
  'vec3_distance',
  'vec3_dot',
  'vec3_length'
];

describe('Tier 5: Rust Physics Kernel Hardening', () => {
  beforeAll(async () => {
    expect(await initWasmPhysics()).toBe(true);
  });

  describe('Shipped artifact integrity', () => {
    it('ships a wasm binary with the full kernel surface', async () => {
      const wasmPath = path.resolve(__dirname, '..', 'public', 'wasm', 'mochi_physics_wasm.wasm');
      expect(fs.existsSync(wasmPath)).toBe(true);

      const bytes = fs.readFileSync(wasmPath);
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const exports = Object.keys(instance.exports);
      for (const name of EXPECTED_EXPORTS) {
        expect(exports, `missing export ${name}`).toContain(name);
      }
    });

    it('keeps the shipped binary under 100 KB', () => {
      const wasmPath = path.resolve(__dirname, '..', 'public', 'wasm', 'mochi_physics_wasm.wasm');
      expect(fs.statSync(wasmPath).size).toBeLessThan(100 * 1024);
    });

    it('initializes the kernel at runtime', () => {
      expect(isWasmPhysicsReady()).toBe(true);
    });
  });

  describe('Ray vs AABB kernel', () => {
    it('returns the entry distance and outward face normal', () => {
      const front = wasmRaycastAABBNormal({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, BOX, 100);
      expect(front.hit).toBe(true);
      expect(front.distance).toBeCloseTo(4, 4);
      expect(front.normal).toEqual({ x: 0, y: 0, z: -1 });

      const back = wasmRaycastAABBNormal({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 }, BOX, 100);
      expect(back.distance).toBeCloseTo(4, 4);
      expect(back.normal).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('reports misses and rays pointing away', () => {
      expect(wasmRaycastAABBNormal({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: -1 }, BOX, 100).hit).toBe(false);
      expect(wasmRaycastAABBNormal({ x: 9, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, BOX, 100).hit).toBe(false);
      expect(wasmRaycastAABBNormal({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, BOX, 2).hit).toBe(false);
    });

    it('handles axis-aligned and diagonal rays consistently', () => {
      const dirs = [
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0.577, y: 0.577, z: 0.577 },
        { x: -0.6, y: 0.8, z: 0 }
      ];
      const origins = [
        { x: -5, y: 0, z: 0 },
        { x: 0, y: -5, z: 0 },
        { x: -5, y: -5, z: -5 },
        { x: 5, y: -5, z: 0 }
      ];

      for (const origin of origins) {
        for (const direction of dirs) {
          const wasm = wasmRaycastAABB(origin, direction, BOX, 100);
          const fallback = slabRaycast(origin, direction, BOX, 100).distance;
          if (fallback < 0) {
            expect(wasm).toBeLessThan(0);
          } else {
            expect(wasm).toBeCloseTo(fallback, 4);
          }
        }
      }
    });
  });

  describe('Sphere vs AABB kernel', () => {
    it('resolves an outside sphere against the nearest face', () => {
      const hit = wasmTestSphereAABB({ x: 0, y: 0, z: 0 }, 2, BOX);
      expect(hit.hit).toBe(true);
      expect(hit.penetration).toBeGreaterThan(0);
      expect(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)).toBeCloseTo(1, 3);
    });

    it('resolves an inside sphere through the shallowest face', () => {
      const shallow: AABB = {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 3 }
      };
      // Centre sits 0.2 from the +z face, so that is the shallowest exit.
      const hit = wasmTestSphereAABB({ x: 0, y: 0, z: 2.8 }, 0.5, shallow);
      expect(hit.hit).toBe(true);
      expect(hit.normal).toEqual({ x: 0, y: 0, z: 1 });
      expect(hit.penetration).toBeCloseTo(0.7, 4);
    });

    it('reports no hit when separated', () => {
      expect(wasmTestSphereAABB({ x: 10, y: 0, z: 0 }, 1, BOX).hit).toBe(false);
    });
  });

  describe('Engine wiring', () => {
    it('routes box raycasts through the kernel with correct normals', () => {
      const box = new RigidBody({
        type: 'static',
        position: { x: 0, y: 0, z: 0 },
        shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } }
      });

      const hit = CollisionDetector.raycastBody(
        { x: 0, y: 0, z: -5 },
        { x: 0, y: 0, z: 1 },
        box,
        100
      );

      expect(hit.hit).toBe(true);
      expect(hit.distance).toBeCloseTo(4, 4);
      expect(hit.normal).toEqual({ x: 0, y: 0, z: -1 });
      expect(hit.bodyId).toBe(box.id);
    });

    it('produces a sphere-box manifold for overlapping bodies', () => {
      const sphere = new RigidBody({
        type: 'dynamic',
        position: { x: 0, y: 1.4, z: 0 },
        shape: { type: 'sphere', radius: 0.5 }
      });
      const box = new RigidBody({
        type: 'static',
        position: { x: 0, y: 0, z: 0 },
        shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } }
      });

      const manifold = CollisionDetector.testSphereBox(sphere, box, false);
      expect(manifold).not.toBeNull();
      expect(manifold!.depth).toBeCloseTo(0.1, 3);
      // bodyA is the sphere, so the normal points from the sphere down into the box.
      expect(manifold!.normal.y).toBeLessThan(-0.9);
      expect(manifold!.contactPoint.y).toBeCloseTo(1, 3);
    });

    it('returns no manifold for separated sphere and box', () => {
      const sphere = new RigidBody({
        type: 'dynamic',
        position: { x: 0, y: 9, z: 0 },
        shape: { type: 'sphere', radius: 0.5 }
      });
      const box = new RigidBody({
        type: 'static',
        shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } }
      });
      expect(CollisionDetector.testSphereBox(sphere, box, false)).toBeNull();
    });
  });
});
