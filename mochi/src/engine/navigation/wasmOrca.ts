// ORCA in the Rust/WASM kernel.
//
// The kernel is f32 while the TypeScript reference is f64, so the parity test
// compares with a tolerance rather than bit for bit. A logic error moves a
// velocity by order 1, which the tolerance still catches.
//
// Returns null when the kernel is not loaded, so the caller falls back to the
// TypeScript solver and behaviour does not depend on the artifact being present.

import { getWasmKernel } from '../physics/wasmPhysics';
import type { OrcaBody, OrcaOptions, OrcaVelocity } from './orca';

export function solveOrcaWasm(bodies: OrcaBody[], options: OrcaOptions = {}): OrcaVelocity[] | null {
  const kernel = getWasmKernel();
  if (!kernel || bodies.length === 0) return null;

  const count = bodies.length;
  const pairs = count * 2;
  const timeHorizon = options.timeHorizon ?? 2;
  const timeStep = options.timeStep ?? 1 / 60;

  const positionsPtr = kernel.alloc_f32_buffer(pairs);
  const velocitiesPtr = kernel.alloc_f32_buffer(pairs);
  const radiiPtr = kernel.alloc_f32_buffer(count);
  const weightsPtr = kernel.alloc_f32_buffer(count);
  const capsPtr = kernel.alloc_f32_buffer(count);
  const outPtr = kernel.alloc_f32_buffer(pairs);

  try {
    // Views are created after every allocation: growing memory detaches buffers.
    const positions = new Float32Array(kernel.memory.buffer, positionsPtr, pairs);
    const velocities = new Float32Array(kernel.memory.buffer, velocitiesPtr, pairs);
    const radii = new Float32Array(kernel.memory.buffer, radiiPtr, count);
    const weights = new Float32Array(kernel.memory.buffer, weightsPtr, count);
    const caps = new Float32Array(kernel.memory.buffer, capsPtr, count);

    for (let index = 0; index < count; index += 1) {
      const body = bodies[index];
      positions[index * 2] = body.x;
      positions[index * 2 + 1] = body.z;
      velocities[index * 2] = body.vx;
      velocities[index * 2 + 1] = body.vz;
      radii[index] = body.radius;
      weights[index] = body.weight;
      caps[index] = body.maxSpeed;
    }

    const solved = kernel.orca_solve(
      positionsPtr,
      velocitiesPtr,
      radiiPtr,
      weightsPtr,
      capsPtr,
      count,
      timeHorizon,
      timeStep,
      outPtr
    );
    if (solved !== count) return null;

    const out = new Float32Array(kernel.memory.buffer, outPtr, pairs);
    const result: OrcaVelocity[] = new Array(count);
    for (let index = 0; index < count; index += 1) {
      result[index] = { vx: out[index * 2], vz: out[index * 2 + 1] };
    }
    return result;
  } finally {
    kernel.free_f32_buffer(positionsPtr, pairs);
    kernel.free_f32_buffer(velocitiesPtr, pairs);
    kernel.free_f32_buffer(radiiPtr, count);
    kernel.free_f32_buffer(weightsPtr, count);
    kernel.free_f32_buffer(capsPtr, count);
    kernel.free_f32_buffer(outPtr, pairs);
  }
}
