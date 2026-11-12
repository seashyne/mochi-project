// Oriented-box (OBB) maths: rotation matrices, world AABBs, SAT narrowphase,
// and ray tests. Used when a box collider carries a non-zero rotation, which is
// how authored scenes rotate blocks and platforms.
//
// Matrices are row-major 3x3 arrays and follow the same XYZ Euler order as
// THREE.Euler, so a collider lines up with the mesh it represents.

import { AABB, PhysicsVec3 } from './types';

export interface ObbHit {
  normal: PhysicsVec3;
  depth: number;
  point: PhysicsVec3;
}

export interface ObbRayHit {
  distance: number;
  normal: PhysicsVec3;
}

export const IDENTITY_MATRIX: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function isIdentityRotation(rotation: PhysicsVec3 | undefined): boolean {
  if (!rotation) return true;
  return rotation.x === 0 && rotation.y === 0 && rotation.z === 0;
}

export function rotationMatrix(rotation: PhysicsVec3): number[] {
  const a = Math.cos(rotation.x);
  const b = Math.sin(rotation.x);
  const c = Math.cos(rotation.y);
  const d = Math.sin(rotation.y);
  const e = Math.cos(rotation.z);
  const f = Math.sin(rotation.z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c
  ];
}

export function rotate(m: number[], v: PhysicsVec3): PhysicsVec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z
  };
}

/** Inverse of a pure rotation is its transpose. */
export function rotateInverse(m: number[], v: PhysicsVec3): PhysicsVec3 {
  return {
    x: m[0] * v.x + m[3] * v.y + m[6] * v.z,
    y: m[1] * v.x + m[4] * v.y + m[7] * v.z,
    z: m[2] * v.x + m[5] * v.y + m[8] * v.z
  };
}

export function orientedBoxAABB(half: PhysicsVec3, position: PhysicsVec3, m: number[]): AABB {
  const ex = Math.abs(m[0]) * half.x + Math.abs(m[1]) * half.y + Math.abs(m[2]) * half.z;
  const ey = Math.abs(m[3]) * half.x + Math.abs(m[4]) * half.y + Math.abs(m[5]) * half.z;
  const ez = Math.abs(m[6]) * half.x + Math.abs(m[7]) * half.y + Math.abs(m[8]) * half.z;
  return {
    min: { x: position.x - ex, y: position.y - ey, z: position.z - ez },
    max: { x: position.x + ex, y: position.y + ey, z: position.z + ez }
  };
}

function column(m: number[], index: number): PhysicsVec3 {
  return { x: m[index], y: m[3 + index], z: m[6 + index] };
}

function dot(a: PhysicsVec3, b: PhysicsVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: PhysicsVec3): PhysicsVec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-6) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function projectionRadius(axis: PhysicsVec3, half: PhysicsVec3, m: number[]): number {
  return (
    Math.abs(dot(axis, column(m, 0))) * half.x +
    Math.abs(dot(axis, column(m, 1))) * half.y +
    Math.abs(dot(axis, column(m, 2))) * half.z
  );
}

/** Support point of a box furthest along `axis`. */
function supportPoint(center: PhysicsVec3, half: PhysicsVec3, m: number[], axis: PhysicsVec3): PhysicsVec3 {
  const out = { ...center };
  for (let i = 0; i < 3; i++) {
    const col = column(m, i);
    const h = i === 0 ? half.x : i === 1 ? half.y : half.z;
    const s = dot(axis, col) >= 0 ? h : -h;
    out.x += col.x * s;
    out.y += col.y * s;
    out.z += col.z * s;
  }
  return out;
}

export function boxBoxObb(
  centerA: PhysicsVec3,
  halfA: PhysicsVec3,
  rotA: number[],
  centerB: PhysicsVec3,
  halfB: PhysicsVec3,
  rotB: number[]
): ObbHit | null {
  const delta = { x: centerB.x - centerA.x, y: centerB.y - centerA.y, z: centerB.z - centerA.z };

  const axes: PhysicsVec3[] = [];
  for (let i = 0; i < 3; i++) axes.push(column(rotA, i));
  for (let i = 0; i < 3; i++) axes.push(column(rotB, i));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const axis = normalize(cross(column(rotA, i), column(rotB, j)));
      if (axis) axes.push(axis);
    }
  }

  let bestDepth = Infinity;
  let bestAxis: PhysicsVec3 | null = null;

  for (const axis of axes) {
    const dist = dot(axis, delta);
    const overlap =
      projectionRadius(axis, halfA, rotA) + projectionRadius(axis, halfB, rotB) - Math.abs(dist);
    if (overlap <= 0) return null;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      const sign = dist >= 0 ? 1 : -1;
      bestAxis = { x: axis.x * sign, y: axis.y * sign, z: axis.z * sign };
    }
  }

  if (!bestAxis) return null;

  const pA = supportPoint(centerA, halfA, rotA, bestAxis);
  const pB = supportPoint(centerB, halfB, rotB, { x: -bestAxis.x, y: -bestAxis.y, z: -bestAxis.z });
  return {
    normal: bestAxis,
    depth: bestDepth,
    point: { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2, z: (pA.z + pB.z) / 2 }
  };
}

/** Normal points from the box towards the sphere (box -> sphere). */
export function sphereBoxObb(
  sphereCenter: PhysicsVec3,
  radius: number,
  boxCenter: PhysicsVec3,
  half: PhysicsVec3,
  rot: number[]
): ObbHit | null {
  const local = rotateInverse(rot, {
    x: sphereCenter.x - boxCenter.x,
    y: sphereCenter.y - boxCenter.y,
    z: sphereCenter.z - boxCenter.z
  });

  const closest = {
    x: Math.min(Math.max(local.x, -half.x), half.x),
    y: Math.min(Math.max(local.y, -half.y), half.y),
    z: Math.min(Math.max(local.z, -half.z), half.z)
  };
  const delta = { x: local.x - closest.x, y: local.y - closest.y, z: local.z - closest.z };
  const dist = Math.hypot(delta.x, delta.y, delta.z);

  if (dist > 1e-6) {
    if (dist >= radius) return null;
    const localNormal = { x: delta.x / dist, y: delta.y / dist, z: delta.z / dist };
    const worldClosest = rotate(rot, closest);
    return {
      normal: rotate(rot, localNormal),
      depth: radius - dist,
      point: {
        x: boxCenter.x + worldClosest.x,
        y: boxCenter.y + worldClosest.y,
        z: boxCenter.z + worldClosest.z
      }
    };
  }

  // Sphere centre is inside the box: exit through the nearest face.
  const faces = [
    { axis: 'x' as const, depth: half.x - Math.abs(local.x), sign: local.x >= 0 ? 1 : -1 },
    { axis: 'y' as const, depth: half.y - Math.abs(local.y), sign: local.y >= 0 ? 1 : -1 },
    { axis: 'z' as const, depth: half.z - Math.abs(local.z), sign: local.z >= 0 ? 1 : -1 }
  ];
  let best = faces[0];
  for (const face of faces) if (face.depth < best.depth) best = face;

  const localNormal =
    best.axis === 'x'
      ? { x: best.sign, y: 0, z: 0 }
      : best.axis === 'y'
        ? { x: 0, y: best.sign, z: 0 }
        : { x: 0, y: 0, z: best.sign };

  return {
    normal: rotate(rot, localNormal),
    depth: best.depth + radius,
    point: sphereCenter
  };
}

export function rayBoxObb(
  origin: PhysicsVec3,
  direction: PhysicsVec3,
  center: PhysicsVec3,
  half: PhysicsVec3,
  rot: number[],
  maxDistance: number
): ObbRayHit | null {
  const localOrigin = rotateInverse(rot, {
    x: origin.x - center.x,
    y: origin.y - center.y,
    z: origin.z - center.z
  });
  const localDir = rotateInverse(rot, direction);

  let tMin = -Infinity;
  let tMax = Infinity;
  let normalAxis = 0;
  let normalSign = 1;

  const origins = [localOrigin.x, localOrigin.y, localOrigin.z];
  const dirs = [localDir.x, localDir.y, localDir.z];
  const halves = [half.x, half.y, half.z];

  for (let i = 0; i < 3; i++) {
    const o = origins[i];
    const d = dirs[i];
    const h = halves[i];
    if (Math.abs(d) < 1e-9) {
      if (o < -h || o > h) return null;
      continue;
    }
    let t1 = (-h - o) / d;
    let t2 = (h - o) / d;
    let sign = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normalAxis = i;
      normalSign = sign;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  const distance = tMin >= 0 ? tMin : tMax;
  if (distance < 0 || distance > maxDistance) return null;

  const localNormal =
    normalAxis === 0
      ? { x: normalSign, y: 0, z: 0 }
      : normalAxis === 1
        ? { x: 0, y: normalSign, z: 0 }
        : { x: 0, y: 0, z: normalSign };

  return { distance, normal: rotate(rot, localNormal) };
}
