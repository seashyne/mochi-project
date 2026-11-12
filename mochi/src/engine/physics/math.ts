// Pure 3D Vector Math operations for physics integration and collision resolution
// Independent of external math libraries to guarantee deterministic zero-dependency execution

import { PhysicsVec3 } from './types';

export class Vec3Math {
  public static create(x = 0, y = 0, z = 0): PhysicsVec3 {
    return { x, y, z };
  }

  public static clone(v: PhysicsVec3): PhysicsVec3 {
    return { x: v.x, y: v.y, z: v.z };
  }

  public static set(out: PhysicsVec3, x: number, y: number, z: number): PhysicsVec3 {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  }

  public static add(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  public static subtract(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  public static scale(v: PhysicsVec3, s: number): PhysicsVec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  public static scaleAndAdd(a: PhysicsVec3, b: PhysicsVec3, s: number): PhysicsVec3 {
    return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
  }

  public static dot(a: PhysicsVec3, b: PhysicsVec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  public static cross(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  public static lengthSq(v: PhysicsVec3): number {
    return v.x * v.x + v.y * v.y + v.z * v.z;
  }

  public static length(v: PhysicsVec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  public static distance(a: PhysicsVec3, b: PhysicsVec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public static normalize(v: PhysicsVec3): PhysicsVec3 {
    const len = Vec3Math.length(v);
    if (len < 1e-8) {
      return { x: 0, y: 0, z: 0 };
    }
    const inv = 1 / len;
    return { x: v.x * inv, y: v.y * inv, z: v.z * inv };
  }

  public static lerp(a: PhysicsVec3, b: PhysicsVec3, t: number): PhysicsVec3 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
  }

  public static clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  public static min(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      z: Math.min(a.z, b.z)
    };
  }

  public static max(a: PhysicsVec3, b: PhysicsVec3): PhysicsVec3 {
    return {
      x: Math.max(a.x, b.x),
      y: Math.max(a.y, b.y),
      z: Math.max(a.z, b.z)
    };
  }
}
