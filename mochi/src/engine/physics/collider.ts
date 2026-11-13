// 3D Collider geometries and Axis-Aligned Bounding Box (AABB) utilities
// Provides broadphase bounds calculation and bounding box overlap checks

import { ColliderShape, PhysicsVec3, AABB } from './types';
import { Vec3Math } from './math';
import { isIdentityRotation, orientedBoxAABB, rotationMatrix } from './oriented';

export type { AABB };

export class ColliderUtils {
  public static computeAABB(shape: ColliderShape, position: PhysicsVec3, rotation?: PhysicsVec3): AABB {
    switch (shape.type) {
      case 'box': {
        if (rotation && !isIdentityRotation(rotation)) {
          return orientedBoxAABB(shape.halfExtents, position, rotationMatrix(rotation));
        }
        const { halfExtents } = shape;
        return {
          min: {
            x: position.x - halfExtents.x,
            y: position.y - halfExtents.y,
            z: position.z - halfExtents.z
          },
          max: {
            x: position.x + halfExtents.x,
            y: position.y + halfExtents.y,
            z: position.z + halfExtents.z
          }
        };
      }
      case 'sphere': {
        const r = shape.radius;
        return {
          min: { x: position.x - r, y: position.y - r, z: position.z - r },
          max: { x: position.x + r, y: position.y + r, z: position.z + r }
        };
      }
      case 'cylinder': {
        const r = shape.radius;
        const hh = shape.halfHeight;
        return {
          min: { x: position.x - r, y: position.y - hh, z: position.z - r },
          max: { x: position.x + r, y: position.y + hh, z: position.z + r }
        };
      }
    }
  }

  public static testAABBOverlap(a: AABB, b: AABB): boolean {
    // Inline on purpose. This runs once per broadphase pair per physics step, and a
    // call across the wasm boundary measured 1.7-2.3x slower than the comparison it
    // performs (`npm run benchmark:kernel`). The kernel earns its keep on bulk
    // passes over scene data, not on scalar maths.
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  }

  public static closestPointOnAABB(point: PhysicsVec3, aabb: AABB): PhysicsVec3 {
    return {
      x: Vec3Math.clamp(point.x, aabb.min.x, aabb.max.x),
      y: Vec3Math.clamp(point.y, aabb.min.y, aabb.max.y),
      z: Vec3Math.clamp(point.z, aabb.min.z, aabb.max.z)
    };
  }

  public static containsPoint(aabb: AABB, point: PhysicsVec3): boolean {
    return (
      point.x >= aabb.min.x &&
      point.x <= aabb.max.x &&
      point.y >= aabb.min.y &&
      point.y <= aabb.max.y &&
      point.z >= aabb.min.z &&
      point.z <= aabb.max.z
    );
  }
}
