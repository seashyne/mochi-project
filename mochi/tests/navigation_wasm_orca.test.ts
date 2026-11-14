// ORCA runs in the Rust kernel; this compares it against the TypeScript solver.
//
// The kernel works in f32 and the reference in f64, so the assertion is a
// tolerance rather than bit equality. A logic error - a flipped sign, a swapped
// left/right leg - moves a velocity by order 1, which the tolerance still catches.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics, isWasmPhysicsReady } from '../src/engine/physics/wasmPhysics';
import { solveOrca, type OrcaBody } from '../src/engine/navigation/orca';
import { solveOrcaWasm } from '../src/engine/navigation/wasmOrca';

const TOLERANCE = 1e-3;

function expectClose(actual: Array<{ vx: number; vz: number }>, expected: Array<{ vx: number; vz: number }>, label: string) {
  expect(actual, label).toHaveLength(expected.length);
  expected.forEach((want, index) => {
    expect(actual[index].vx, `${label} vx[${index}]`).toBeCloseTo(want.vx, 3);
    expect(actual[index].vz, `${label} vz[${index}]`).toBeCloseTo(want.vz, 3);
  });
}

function body(overrides: Partial<OrcaBody> = {}): OrcaBody {
  return { x: 0, z: 0, vx: 0, vz: 0, radius: 0.4, maxSpeed: 4, weight: 1, ...overrides };
}

describe('orca in the kernel', () => {
  beforeAll(async () => {
    await initWasmPhysics();
  });

  it('loads the kernel', () => {
    expect(isWasmPhysicsReady()).toBe(true);
  });

  it('matches the reference on a head-on pair', () => {
    const bodies = [body({ x: 0, z: 0, vx: 2, vz: 0 }), body({ x: 2.4, z: 0, vx: -2, vz: 0 })];
    const wasm = solveOrcaWasm(bodies, { timeHorizon: 2, timeStep: 1 / 60 })!;
    expect(wasm).not.toBeNull();
    expectClose(wasm, solveOrca(bodies, { timeHorizon: 2, timeStep: 1 / 60 }), 'head-on');
  });

  it('matches the reference on a crowd with an immovable body', () => {
    const bodies = [
      body({ x: 0, z: 0, vx: 1.5, vz: 0.2 }),
      body({ x: 1.1, z: 0.4, vx: -1, vz: -0.5 }),
      body({ x: 0.6, z: 1.2, vx: 0.3, vz: -1.8 }),
      body({ x: -0.9, z: 0.7, vx: 2, vz: 0.1 }),
      body({ x: 0.2, z: 0, radius: 0.5, weight: 0 })
    ];
    const wasm = solveOrcaWasm(bodies, { timeHorizon: 1.5, timeStep: 1 / 60 })!;
    expect(wasm).not.toBeNull();
    expectClose(wasm, solveOrca(bodies, { timeHorizon: 1.5, timeStep: 1 / 60 }), 'crowd');
  });

  it('matches the reference when discs already overlap', () => {
    const bodies = [body({ x: 0, z: 0, vx: 1, vz: 0 }), body({ x: 0.3, z: 0.1, vx: -1, vz: 0 })];
    const wasm = solveOrcaWasm(bodies, { timeHorizon: 2, timeStep: 1 / 60 })!;
    expectClose(wasm, solveOrca(bodies, { timeHorizon: 2, timeStep: 1 / 60 }), 'overlap');
  });

  it('keeps the immovable body untouched in both implementations', () => {
    const bodies = [body({ x: 0, z: 0, vx: 2, vz: 0 }), body({ x: 1.2, z: 0, weight: 0 })];
    const wasm = solveOrcaWasm(bodies)!;
    expect(wasm![1]).toEqual({ vx: 0, vz: 0 });
    expect(solveOrca(bodies)[1]).toEqual({ vx: 0, vz: 0 });
  });

  it('agrees within tolerance on a scattered crowd', () => {
    const bodies: OrcaBody[] = [];
    for (let index = 0; index < 9; index += 1) {
      bodies.push(
        body({
          x: Math.sin(index * 1.7) * 3,
          z: Math.cos(index * 2.3) * 3,
          vx: Math.cos(index * 0.9) * 1.6,
          vz: Math.sin(index * 1.1) * 1.6
        })
      );
    }
    const wasm = solveOrcaWasm(bodies, { timeHorizon: 1.8, timeStep: 1 / 60 })!;
    const reference = solveOrca(bodies, { timeHorizon: 1.8, timeStep: 1 / 60 });
    reference.forEach((want, index) => {
      expect(wasm[index].vx).toBeCloseTo(want.vx, 3);
      expect(wasm[index].vz).toBeCloseTo(want.vz, 3);
    });
    // Nothing may exceed the cap in either implementation.
    for (const solved of [...wasm, ...reference]) {
      expect(Math.hypot(solved.vx, solved.vz)).toBeLessThanOrEqual(4 + TOLERANCE);
    }
  });
});
