// Mochi 3D Physics WebAssembly Kernel Bridge
// High-performance zero-GC physics math with transparent pure TypeScript fallbacks

import { PhysicsVec3, AABB } from './types';
import { RAY_MISS, slabRaycast, type RaycastAABBResult } from './raycastAABB';
import type { WasmPhysicsExports } from './wasmExports';

export type { WasmPhysicsExports };
export type { RaycastAABBResult };


let wasmInstance: WasmPhysicsExports | null = null;
let scratchBufferPtr = 0;
let normalBufferPtr = 0;
let initPromise: Promise<boolean> | null = null;

export async function initWasmPhysics(customWasmUrl?: string): Promise<boolean> {
  if (wasmInstance) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let bytes: BufferSource;
      if (typeof window === 'undefined') {
        // Node.js test environment
        const fs = await import('fs');
        const path = await import('path');
        const wasmPath = path.resolve(
          process.cwd(),
          'public/wasm/mochi_physics_wasm.wasm'
        );
        bytes = fs.readFileSync(wasmPath);
      } else {
        // Browser environment
        const url = customWasmUrl || '/wasm/mochi_physics_wasm.wasm';
        const response = await fetch(url);
        if (!response.ok) return false;
        bytes = await response.arrayBuffer();
      }

      const { instance } = await WebAssembly.instantiate(bytes, {});
      wasmInstance = instance.exports as unknown as WasmPhysicsExports;
      scratchBufferPtr = wasmInstance.alloc_f32_buffer(16);
      normalBufferPtr = wasmInstance.alloc_f32_buffer(4);
      return true;
    } catch {
      wasmInstance = null;
      return false;
    }
  })();

  return initPromise;
}

export function isWasmPhysicsReady(): boolean {
  return wasmInstance !== null;
}

/**
 * The loaded kernel, for engine subsystems that share it. Navigation bakes its
 * grid here rather than in a TypeScript loop; callers must handle `null` (kernel
 * not loaded, or the browser never fetched it) and fall back.
 */
export function getWasmKernel(): WasmPhysicsExports | null {
  return wasmInstance;
}

export function wasmVec3Length(x: number, y: number, z: number): number {
  if (wasmInstance) return wasmInstance.vec3_length(x, y, z);
  return Math.sqrt(x * x + y * y + z * z);
}

export function wasmVec3Distance(a: PhysicsVec3, b: PhysicsVec3): number {
  if (wasmInstance) return wasmInstance.vec3_distance(a.x, a.y, a.z, b.x, b.y, b.z);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function wasmTestAABBOverlap(a: AABB, b: AABB): boolean {
  if (wasmInstance) {
    return wasmInstance.test_aabb_aabb(
      a.min.x, a.min.y, a.min.z,
      a.max.x, a.max.y, a.max.z,
      b.min.x, b.min.y, b.min.z,
      b.max.x, b.max.y, b.max.z
    ) === 1;
  }
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

export function wasmTestSphereAABB(
  sphereCenter: PhysicsVec3,
  radius: number,
  box: AABB
): { hit: boolean; normal: PhysicsVec3; penetration: number } {
  if (wasmInstance && scratchBufferPtr) {
    const hit = wasmInstance.test_sphere_aabb(
      sphereCenter.x, sphereCenter.y, sphereCenter.z, radius,
      box.min.x, box.min.y, box.min.z,
      box.max.x, box.max.y, box.max.z,
      scratchBufferPtr
    ) === 1;

    if (!hit) return { hit: false, normal: { x: 0, y: 1, z: 0 }, penetration: 0 };
    const mem = new Float32Array(wasmInstance.memory.buffer, scratchBufferPtr, 4);
    return {
      hit: true,
      normal: { x: mem[0], y: mem[1], z: mem[2] },
      penetration: mem[3]
    };
  }

  // TypeScript fallback
  const cx = Math.max(box.min.x, Math.min(sphereCenter.x, box.max.x));
  const cy = Math.max(box.min.y, Math.min(sphereCenter.y, box.max.y));
  const cz = Math.max(box.min.z, Math.min(sphereCenter.z, box.max.z));
  const dx = sphereCenter.x - cx;
  const dy = sphereCenter.y - cy;
  const dz = sphereCenter.z - cz;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > radius * radius) {
    return { hit: false, normal: { x: 0, y: 1, z: 0 }, penetration: 0 };
  }
  const dist = Math.sqrt(distSq);
  const inv = dist > 0.0001 ? 1 / dist : 1;
  return {
    hit: true,
    normal: dist > 0.0001 ? { x: dx * inv, y: dy * inv, z: dz * inv } : { x: 0, y: 1, z: 0 },
    penetration: radius - dist
  };
}

export function wasmRaycastAABBNormal(
  origin: PhysicsVec3,
  direction: PhysicsVec3,
  box: AABB,
  maxDistance: number
): RaycastAABBResult {
  if (wasmInstance && normalBufferPtr) {
    const distance = wasmInstance.ray_intersect_aabb_normal(
      origin.x, origin.y, origin.z,
      direction.x, direction.y, direction.z,
      box.min.x, box.min.y, box.min.z,
      box.max.x, box.max.y, box.max.z,
      maxDistance,
      normalBufferPtr
    );
    if (distance < 0) return RAY_MISS;
    const mem = new Float32Array(wasmInstance.memory.buffer, normalBufferPtr, 3);
    return { hit: true, distance, normal: { x: mem[0], y: mem[1], z: mem[2] } };
  }

  return slabRaycast(origin, direction, box, maxDistance);
}

export function wasmRaycastAABB(
  origin: PhysicsVec3,
  direction: PhysicsVec3,
  box: AABB,
  maxDistance: number
): number {
  return wasmRaycastAABBNormal(origin, direction, box, maxDistance).distance;
}

export function wasmResolveCharacterBox(
  pos: PhysicsVec3,
  radius: number,
  halfHeight: number,
  box: AABB
): { collided: boolean; resolvedPos: PhysicsVec3 } {
  if (wasmInstance && scratchBufferPtr) {
    const res = wasmInstance.resolve_character_box_collision(
      pos.x, pos.y, pos.z,
      radius, halfHeight,
      box.min.x, box.min.y, box.min.z,
      box.max.x, box.max.y, box.max.z,
      scratchBufferPtr
    );
    if (res === 0) return { collided: false, resolvedPos: { ...pos } };
    const mem = new Float32Array(wasmInstance.memory.buffer, scratchBufferPtr, 3);
    return {
      collided: true,
      resolvedPos: { x: mem[0], y: mem[1], z: mem[2] }
    };
  }

  // Pure TS fallback
  const charMin = { x: pos.x - radius, y: pos.y, z: pos.z - radius };
  const charMax = { x: pos.x + radius, y: pos.y + halfHeight * 2, z: pos.z + radius };
  if (
    charMax.x < box.min.x || charMin.x > box.max.x ||
    charMax.y < box.min.y || charMin.y > box.max.y ||
    charMax.z < box.min.z || charMin.z > box.max.z
  ) {
    return { collided: false, resolvedPos: { ...pos } };
  }

  const penX = (box.max.x - charMin.x < charMax.x - box.min.x)
    ? box.max.x - charMin.x
    : -(charMax.x - box.min.x);
  const penY = (box.max.y - charMin.y < charMax.y - box.min.y)
    ? box.max.y - charMin.y
    : -(charMax.y - box.min.y);
  const penZ = (box.max.z - charMin.z < charMax.z - box.min.z)
    ? box.max.z - charMin.z
    : -(charMax.z - box.min.z);

  const resolved = { ...pos };
  if (Math.abs(penY) <= Math.abs(penX) && Math.abs(penY) <= Math.abs(penZ)) {
    resolved.y += penY;
  } else if (Math.abs(penX) <= Math.abs(penZ)) {
    resolved.x += penX;
  } else {
    resolved.z += penZ;
  }
  return { collided: true, resolvedPos: resolved };
}
