// Euler <-> rotation-matrix conversion for the `CFrame` value type.
//
// The matrix convention is the one `physics/oriented.ts` already uses for oriented
// colliders: row-major 3x3, Euler XYZ, the same order three.js applies to a mesh.
// Keeping one convention means a CFrame written from a script lands on screen exactly
// where the collider says it should.
//
// The Lua side owns composition (`cf * cf`), because `*` needs a metamethod. This
// module only converts at the boundary: node rotation in, CFrame out, and back.

import { rotationMatrix } from '../physics/oriented';
import type { RuntimeVec3 } from './types';

export { rotationMatrix };

const EPSILON = 1e-6;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Decomposes a row-major 3x3 into Euler XYZ radians.
 *
 * At gimbal lock (`cos y` near zero) the X and Z rotations describe the same axis, so
 * Z is folded into X and reported as 0. That is the standard choice and it round-trips
 * back to the same matrix, which is the property that matters here.
 */
export function eulerFromMatrix(m: number[]): RuntimeVec3 {
  const m02 = clampUnit(m[2]);

  if (Math.abs(m02) < 1 - EPSILON) {
    return {
      x: Math.atan2(-m[5], m[8]),
      y: Math.asin(m02),
      z: Math.atan2(-m[1], m[0])
    };
  }

  // cos(y) is zero: only the sum or difference of x and z is recoverable.
  const x = Math.atan2(m[3], m[4]);
  return { x: m02 > 0 ? x : -x, y: Math.asin(m02), z: 0 };
}

/** True when the matrix round-trips to within a radian tolerance of the input. */
export function matrixMatchesEuler(m: number[], rotation: RuntimeVec3): boolean {
  const rebuilt = rotationMatrix(rotation);
  for (let index = 0; index < 9; index += 1) {
    if (Math.abs(rebuilt[index] - m[index]) > 1e-4) return false;
  }
  return true;
}
