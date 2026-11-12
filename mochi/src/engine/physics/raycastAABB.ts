// Pure TypeScript AABB raycast used as the WebAssembly fallback. Kept separate
// so the wasm bridge file stays within the project's size budget.

import type { AABB, PhysicsVec3 } from './types';

export interface RaycastAABBResult {
  hit: boolean;
  distance: number;
  normal: PhysicsVec3;
}

export const RAY_MISS: RaycastAABBResult = {
  hit: false,
  distance: -1,
  normal: { x: 0, y: 1, z: 0 }
};

// Mirrors the Rust `ray_intersect_aabb_normal` slab test exactly, including the
// entry-face normal, so the fallback and the kernel stay numerically in parity.
export function slabRaycast(
  origin: PhysicsVec3,
  direction: PhysicsVec3,
  box: AABB,
  maxDistance: number
): RaycastAABBResult {
  let tmin = 0;
  let tmax = maxDistance;
  let normal: PhysicsVec3 = { x: 0, y: 1, z: 0 };
  const axes: Array<keyof PhysicsVec3> = ['x', 'y', 'z'];

  for (const axis of axes) {
    const o = origin[axis];
    const d = direction[axis];
    const bMin = box.min[axis];
    const bMax = box.max[axis];

    if (Math.abs(d) > 0.000001) {
      const inv = 1 / d;
      let t1 = (bMin - o) * inv;
      let t2 = (bMax - o) * inv;
      let sign = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        sign = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        normal = {
          x: axis === 'x' ? sign : 0,
          y: axis === 'y' ? sign : 0,
          z: axis === 'z' ? sign : 0
        };
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return RAY_MISS;
    } else if (o < bMin || o > bMax) {
      return RAY_MISS;
    }
  }

  if (tmin < 0) return RAY_MISS;
  return { hit: true, distance: tmin, normal };
}
