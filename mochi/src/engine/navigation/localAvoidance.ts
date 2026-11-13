// Reciprocal local avoidance for walking agents.
//
// Agents are discs in the XZ plane. Each tick every overlapping pair is pushed
// apart along its centre line, split by weight, so a moving agent never shoves the
// player or a prop. The kernel runs the pairwise pass; the TypeScript version here
// is both the fallback and the reference the parity test compares against.

import { getWasmKernel } from '../physics/wasmPhysics';

export interface OverlapBody {
  x: number;
  z: number;
  radius: number;
  /** Share of a push this body takes: 1 moves, 0 is immovable. */
  weight: number;
}

export interface OverlapOptions {
  /** Cap per pair per iteration, in metres. Defaults to 0.25. */
  maxStep?: number;
  /** Resolution passes. Defaults to 4. */
  iterations?: number;
}

export const DEFAULT_MAX_STEP = 0.25;
export const DEFAULT_ITERATIONS = 4;

/**
 * Lateral bias applied to the push between two movable bodies. Two agents walking
 * straight at each other would otherwise be pushed exactly opposite their travel
 * and lock; a few degrees of rotation turns the deadlock into a slide past.
 */
export const HEAD_ON_BIAS = 0.15;

/**
 * Separates overlapping bodies in place and returns how many moves were applied.
 * Uses the WASM kernel when it is loaded.
 */
export function resolveOverlaps(bodies: OverlapBody[], options: OverlapOptions = {}): number {
  const maxStep = options.maxStep ?? DEFAULT_MAX_STEP;
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  if (bodies.length < 2 || !(maxStep > 0)) return 0;

  const kernel = getWasmKernel();
  if (!kernel) return resolveOverlapsTypeScript(bodies, maxStep, iterations);

  const count = bodies.length;
  const positionsPtr = kernel.alloc_f32_buffer(count * 2);
  const radiiPtr = kernel.alloc_f32_buffer(count);
  const weightsPtr = kernel.alloc_f32_buffer(count);

  try {
    // Views after every allocation: growing memory detaches existing buffers.
    const positions = new Float32Array(kernel.memory.buffer, positionsPtr, count * 2);
    const radii = new Float32Array(kernel.memory.buffer, radiiPtr, count);
    const weights = new Float32Array(kernel.memory.buffer, weightsPtr, count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 2] = bodies[index].x;
      positions[index * 2 + 1] = bodies[index].z;
      radii[index] = bodies[index].radius;
      weights[index] = bodies[index].weight;
    }

    const applied = kernel.resolve_overlaps(
      positionsPtr,
      radiiPtr,
      weightsPtr,
      count,
      maxStep,
      iterations
    );

    const resolved = new Float32Array(kernel.memory.buffer, positionsPtr, count * 2);
    for (let index = 0; index < count; index += 1) {
      bodies[index].x = resolved[index * 2];
      bodies[index].z = resolved[index * 2 + 1];
    }
    return applied;
  } finally {
    kernel.free_f32_buffer(positionsPtr, count * 2);
    kernel.free_f32_buffer(radiiPtr, count);
    kernel.free_f32_buffer(weightsPtr, count);
  }
}

/** Reference implementation. Same pair order and caps as the kernel. */
export function resolveOverlapsTypeScript(
  bodies: OverlapBody[],
  maxStep: number = DEFAULT_MAX_STEP,
  iterations: number = DEFAULT_ITERATIONS
): number {
  let applied = 0;

  for (let pass = 0; pass < Math.max(1, iterations); pass += 1) {
    let moved = false;
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        const totalWeight = a.weight + b.weight;
        if (!(totalWeight > 0)) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distanceSq = dx * dx + dz * dz;
        const reach = a.radius + b.radius;
        if (!(reach > 0) || distanceSq >= reach * reach) continue;

        const distance = Math.sqrt(distanceSq);
        let nx = distance > 1e-6 ? dx / distance : 1;
        let nz = distance > 1e-6 ? dz / distance : 0;

        // Movable-vs-movable pushes are rotated slightly, or a head-on pair locks
        // (the push is exactly opposite both agents' travel). Pushing off a wall or
        // the player stays square.
        if (a.weight > 0 && b.weight > 0) {
          const biasedX = nx - nz * HEAD_ON_BIAS;
          const biasedZ = nz + nx * HEAD_ON_BIAS;
          const biasedLength = Math.hypot(biasedX, biasedZ);
          if (biasedLength > 1e-6) {
            nx = biasedX / biasedLength;
            nz = biasedZ / biasedLength;
          }
        }

        const push = Math.min(reach - distance, maxStep);
        const shareA = a.weight / totalWeight;
        const shareB = b.weight / totalWeight;

        a.x -= nx * push * shareA;
        a.z -= nz * push * shareA;
        b.x += nx * push * shareB;
        b.z += nz * push * shareB;

        moved = true;
        applied += 1;
      }
    }
    if (!moved) break;
  }

  return applied;
}
