// Mesh decimation: the Rust kernel is the shipping path, the TypeScript version is
// the fallback. These tests pin the two together and lock the invariants the LOD
// builder relies on.

import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initWasmPhysics, isWasmPhysicsReady } from '../src/engine/physics/wasmPhysics';
import {
  simplifyMesh,
  simplifyMeshTypeScript,
  type SimplifyInput
} from '../src/engine/assets/meshSimplification';
import { MODEL_LOD_DECIMATE_DIVISIONS } from '../src/engine/assets/modelLod';

/** A UV sphere: dense enough that clustering has real work to do. */
function sphereInput(segments = 32, rings = 24, radius = 1): SimplifyInput {
  const geometry = new THREE.SphereGeometry(radius, segments, rings);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  return {
    positions: position.array as ArrayLike<number>,
    indices: index.array as ArrayLike<number>,
    vertexCount: position.count,
    indexCount: index.count,
    // Same grid the LOD builder picks, so the numbers below mean something.
    cellSize: (radius * 2) / MODEL_LOD_DECIMATE_DIVISIONS
  };
}

function trianglesOf(indexCount: number): number {
  return indexCount / 3;
}

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
  expect(isWasmPhysicsReady()).toBe(true);
});

describe('simplify_mesh kernel', () => {
  it('agrees with the TypeScript reference exactly', () => {
    const input = sphereInput();
    const fromKernel = simplifyMesh(input);
    const fromTypeScript = simplifyMeshTypeScript(input);

    expect(fromKernel.vertexCount).toBe(fromTypeScript.vertexCount);
    expect(fromKernel.indexCount).toBe(fromTypeScript.indexCount);
    expect(Array.from(fromKernel.positions)).toEqual(Array.from(fromTypeScript.positions));
    expect(Array.from(fromKernel.indices)).toEqual(Array.from(fromTypeScript.indices));
    expect(Array.from(fromKernel.sources)).toEqual(Array.from(fromTypeScript.sources));
  });

  it('decimates a dense sphere to a few thousand triangles', () => {
    const input = sphereInput(96, 64);
    const result = simplifyMesh(input);
    expect(result.indexCount).toBeGreaterThan(0);
    expect(trianglesOf(result.indexCount)).toBeLessThan(trianglesOf(input.indexCount) * 0.6);
    expect(trianglesOf(result.indexCount)).toBeLessThan(8_000);
  });

  it('targets a triangle budget instead of a ratio', () => {
    // Same cell size, four times the input density: a ratio-based reducer would
    // quadruple its output here, a budget-based one lands in the same place.
    const light = simplifyMesh(sphereInput(96, 64));
    const dense = simplifyMesh(sphereInput(192, 128));

    expect(trianglesOf(dense.indexCount)).toBeLessThan(12_000);
    expect(trianglesOf(dense.indexCount)).toBeLessThan(trianglesOf(light.indexCount) * 2);
  });

  it('is deterministic across runs', () => {
    const input = sphereInput();
    const first = simplifyMesh(input);
    const second = simplifyMesh(input);
    expect(Array.from(second.positions)).toEqual(Array.from(first.positions));
    expect(Array.from(second.indices)).toEqual(Array.from(first.indices));
  });

  it('only ever emits vertices that existed in the input', () => {
    const input = sphereInput();
    const result = simplifyMesh(input);
    expect(result.vertexCount).toBeLessThan(input.vertexCount);

    for (let vertex = 0; vertex < result.vertexCount; vertex += 1) {
      const source = result.sources[vertex];
      expect(source).toBeLessThan(input.vertexCount);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(result.positions[vertex * 3 + axis]).toBe(input.positions[source * 3 + axis]);
      }
    }
  });

  it('keeps every index inside the output vertex range', () => {
    const result = simplifyMesh(sphereInput());
    expect(result.indexCount % 3).toBe(0);
    for (let entry = 0; entry < result.indexCount; entry += 1) {
      expect(result.indices[entry]).toBeLessThan(result.vertexCount);
    }
  });

  it('refuses a cell size that is not positive', () => {
    const input = { ...sphereInput(), cellSize: 0 };
    expect(simplifyMesh(input).vertexCount).toBe(0);
    expect(simplifyMeshTypeScript(input).vertexCount).toBe(0);
  });

  it('refuses an index that points outside the vertex array', () => {
    const base = sphereInput();
    const indices = Uint32Array.from(base.indices as ArrayLike<number>);
    indices[0] = base.vertexCount + 5;
    const input = { ...base, indices };

    expect(simplifyMesh(input).vertexCount).toBe(0);
    expect(simplifyMeshTypeScript(input).vertexCount).toBe(0);
  });

  it('refuses a non-finite position', () => {
    const base = sphereInput();
    const positions = Float32Array.from(base.positions as ArrayLike<number>);
    positions[0] = Number.NaN;
    const input = { ...base, positions };

    expect(simplifyMesh(input).vertexCount).toBe(0);
    expect(simplifyMeshTypeScript(input).vertexCount).toBe(0);
  });

  it('collapses a mesh whose whole extent fits one cell', () => {
    // A single cell cannot hold a triangle: all three corners land in one cluster.
    const input = { ...sphereInput(8, 6), cellSize: 10 };
    expect(simplifyMesh(input).vertexCount).toBe(0);
    expect(simplifyMeshTypeScript(input).vertexCount).toBe(0);
  });

  it('welds coincident vertices at a fine cell size without dropping triangles', () => {
    // A UV sphere duplicates its seam and pole vertices; a sub-micron grid still
    // merges those, which is a weld rather than a decimation.
    const input = { ...sphereInput(8, 6), cellSize: 0.0001 };
    const result = simplifyMesh(input);
    expect(result.vertexCount).toBeLessThan(input.vertexCount);
    expect(result.indexCount).toBeGreaterThanOrEqual(input.indexCount * 0.9);
  });
});
