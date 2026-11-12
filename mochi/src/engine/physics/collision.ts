// Narrowphase 3D Collision Detection and Raycasting algorithms
// Implements Sphere-Sphere, Box-Box (AABB), and Sphere-Box manifold generation

import { CollisionManifold, PhysicsVec3, RaycastHit } from './types';
import { RigidBody } from './body';
import { Vec3Math } from './math';
import { wasmRaycastAABBNormal, wasmTestSphereAABB } from './wasmPhysics';
import { IDENTITY_MATRIX, boxBoxObb, rayBoxObb, sphereBoxObb } from './oriented';

export class CollisionDetector {
  public static testCollision(a: RigidBody, b: RigidBody): CollisionManifold | null {
    if (a.shape.type === 'sphere' && b.shape.type === 'sphere') {
      return this.testSphereSphere(a, b);
    }
    if (a.shape.type === 'box' && b.shape.type === 'box') {
      return this.testBoxBox(a, b);
    }
    if (a.shape.type === 'sphere' && b.shape.type === 'box') {
      return this.testSphereBox(a, b, false);
    }
    if (a.shape.type === 'box' && b.shape.type === 'sphere') {
      return this.testSphereBox(b, a, true);
    }
    return null;
  }

  public static testSphereSphere(a: RigidBody, b: RigidBody): CollisionManifold | null {
    if (a.shape.type !== 'sphere' || b.shape.type !== 'sphere') return null;

    const rA = a.shape.radius;
    const rB = b.shape.radius;
    const diff = Vec3Math.subtract(b.position, a.position);
    const distSq = Vec3Math.lengthSq(diff);
    const radiusSum = rA + rB;

    if (distSq >= radiusSum * radiusSum) return null;

    const dist = Math.sqrt(distSq);
    const normal = dist > 1e-6 ? Vec3Math.scale(diff, 1 / dist) : { x: 0, y: 1, z: 0 };
    const depth = radiusSum - dist;
    const contactPoint = Vec3Math.add(a.position, Vec3Math.scale(normal, rA - depth * 0.5));

    return { bodyA: a, bodyB: b, normal, depth, contactPoint };
  }

  public static testBoxBox(a: RigidBody, b: RigidBody): CollisionManifold | null {
    if (a.shape.type !== 'box' || b.shape.type !== 'box') return null;

    // Rotated boxes go through the oriented SAT path; axis-aligned pairs keep
    // the cheaper single-axis overlap test.
    if (a.isOriented || b.isOriented) {
      const hit = boxBoxObb(
        a.position,
        a.shape.halfExtents,
        a.getRotationMatrix() ?? IDENTITY_MATRIX,
        b.position,
        b.shape.halfExtents,
        b.getRotationMatrix() ?? IDENTITY_MATRIX
      );
      if (!hit) return null;
      return { bodyA: a, bodyB: b, normal: hit.normal, depth: hit.depth, contactPoint: hit.point };
    }

    const hA = a.shape.halfExtents;
    const hB = b.shape.halfExtents;
    const diff = Vec3Math.subtract(b.position, a.position);

    const overlapX = hA.x + hB.x - Math.abs(diff.x);
    if (overlapX <= 0) return null;

    const overlapY = hA.y + hB.y - Math.abs(diff.y);
    if (overlapY <= 0) return null;

    const overlapZ = hA.z + hB.z - Math.abs(diff.z);
    if (overlapZ <= 0) return null;

    // Minimum penetration axis is contact normal
    let normal: PhysicsVec3 = { x: 0, y: 0, z: 0 };
    let depth = overlapX;

    if (overlapX <= overlapY && overlapX <= overlapZ) {
      depth = overlapX;
      normal = { x: diff.x >= 0 ? 1 : -1, y: 0, z: 0 };
    } else if (overlapY <= overlapX && overlapY <= overlapZ) {
      depth = overlapY;
      normal = { x: 0, y: diff.y >= 0 ? 1 : -1, z: 0 };
    } else {
      depth = overlapZ;
      normal = { x: 0, y: 0, z: diff.z >= 0 ? 1 : -1 };
    }

    const contactPoint = Vec3Math.add(a.position, Vec3Math.scale(normal, depth * 0.5));
    return { bodyA: a, bodyB: b, normal, depth, contactPoint };
  }

  public static testSphereBox(
    sphere: RigidBody,
    box: RigidBody,
    inverted: boolean
  ): CollisionManifold | null {
    if (sphere.shape.type !== 'sphere' || box.shape.type !== 'box') return null;

    const radius = sphere.shape.radius;
    const hB = box.shape.halfExtents;
    const diff = Vec3Math.subtract(sphere.position, box.position);

    if (box.isOriented) {
      const oriented = sphereBoxObb(
        sphere.position,
        radius,
        box.position,
        hB,
        box.getRotationMatrix() ?? IDENTITY_MATRIX
      );
      if (!oriented) return null;
      return inverted
        ? { bodyA: box, bodyB: sphere, normal: oriented.normal, depth: oriented.depth, contactPoint: oriented.point }
        : {
            bodyA: sphere,
            bodyB: box,
            normal: Vec3Math.scale(oriented.normal, -1),
            depth: oriented.depth,
            contactPoint: oriented.point
          };
    }

    // Closest point on box surface
    const closest: PhysicsVec3 = {
      x: Vec3Math.clamp(diff.x, -hB.x, hB.x),
      y: Vec3Math.clamp(diff.y, -hB.y, hB.y),
      z: Vec3Math.clamp(diff.z, -hB.z, hB.z)
    };

    // Rust kernel covers both the outside and inside-centre cases.
    const kernel = wasmTestSphereAABB(sphere.position, radius, box.getAABB());
    if (!kernel.hit) return null;

    const delta = Vec3Math.subtract(diff, closest);
    const distSq = Vec3Math.lengthSq(delta);
    const normalFromBox = kernel.normal;
    const depth = kernel.penetration;
    const contactPoint = distSq > 0
      ? Vec3Math.add(box.position, closest)
      : Vec3Math.clone(sphere.position);

    return inverted
      ? { bodyA: box, bodyB: sphere, normal: normalFromBox, depth, contactPoint }
      : { bodyA: sphere, bodyB: box, normal: Vec3Math.scale(normalFromBox, -1), depth, contactPoint };
  }

  public static raycastBody(
    origin: PhysicsVec3,
    direction: PhysicsVec3,
    body: RigidBody,
    maxDistance: number
  ): RaycastHit {
    const noHit: RaycastHit = {
      hit: false,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      distance: Infinity,
      bodyId: null
    };

    const dir = Vec3Math.normalize(direction);
    if (body.shape.type === 'sphere') {
      const oc = Vec3Math.subtract(origin, body.position);
      const b = Vec3Math.dot(oc, dir);
      const c = Vec3Math.dot(oc, oc) - body.shape.radius * body.shape.radius;
      const discriminant = b * b - c;
      if (discriminant < 0) return noHit;

      const sqrtD = Math.sqrt(discriminant);
      let t = -b - sqrtD;
      if (t < 0) t = -b + sqrtD;
      if (t < 0 || t > maxDistance) return noHit;

      const hitPoint = Vec3Math.scaleAndAdd(origin, dir, t);
      const normal = Vec3Math.normalize(Vec3Math.subtract(hitPoint, body.position));
      return { hit: true, point: hitPoint, normal, distance: t, bodyId: body.id };
    }

    if (body.shape.type === 'box') {
      if (body.isOriented) {
        const orientedHit = rayBoxObb(
          origin,
          dir,
          body.position,
          body.shape.halfExtents,
          body.getRotationMatrix() ?? IDENTITY_MATRIX,
          maxDistance
        );
        if (!orientedHit) return noHit;
        return {
          hit: true,
          point: Vec3Math.scaleAndAdd(origin, dir, orientedHit.distance),
          normal: orientedHit.normal,
          distance: orientedHit.distance,
          bodyId: body.id
        };
      }

      // Routed through the Rust kernel (ray_intersect_aabb_normal); the TS slab
      // fallback inside the bridge keeps behaviour identical without WASM.
      const result = wasmRaycastAABBNormal(origin, dir, body.getAABB(), maxDistance);
      if (!result.hit) return noHit;
      return {
        hit: true,
        point: Vec3Math.scaleAndAdd(origin, dir, result.distance),
        normal: result.normal,
        distance: result.distance,
        bodyId: body.id
      };
    }

    return noHit;
  }
}
