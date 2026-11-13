// Kernel speed: what the Rust kernel actually buys, measured against the
// TypeScript implementations it replaces.
//
// The parity suites prove the two agree. This one asks whether the boundary is
// worth crossing: for a scalar call the JS -> wasm hop can cost more than the
// arithmetic it performs, and the only way to know is to time both.
//
// Run with: npm run benchmark:kernel

import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initWasmPhysics, getWasmKernel } from '../src/engine/physics/wasmPhysics';
import { buildNavGrid } from '../src/engine/navigation/navGridFromScene';
import { resolveOverlaps, resolveOverlapsTypeScript } from '../src/engine/navigation/localAvoidance';
import { simplifyMesh, simplifyMeshTypeScript } from '../src/engine/assets/meshSimplification';
import {
  OCCLUSION_HEIGHT,
  OCCLUSION_WIDTH,
  rasterizeOccluders,
  rasterizeOccludersTypeScript,
  testOcclusion,
  testOcclusionTypeScript
} from '../src/engine/scene/occlusionRaster';
import {
  findObjectsArrayStart,
  scanJsonArrayRanges,
  scanJsonArrayRangesTypeScript
} from '../src/engine/scene/chunkObjectStream';
import type { StudioObject } from '../src/engine/studio/types';

interface Row {
  name: string;
  kernelMs: number;
  typescriptMs: number;
  note: string;
}

const rows: Row[] = [];

function timeMs(run: () => void, iterations: number): number {
  // Warm up so the JIT has settled before the measurement.
  for (let index = 0; index < Math.min(iterations, 200); index += 1) run();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) run();
  return (performance.now() - started) / iterations;
}

function record(name: string, kernelMs: number, typescriptMs: number, note: string): void {
  rows.push({ name, kernelMs, typescriptMs, note });
}

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
  expect(getWasmKernel()).not.toBeNull();
});

describe('kernel versus TypeScript', () => {
  it('scalar collider maths', () => {
    const kernel = getWasmKernel()!;
    // A representative overlap: two boxes intersecting on one axis.
    const aMin = { x: 0, y: 0, z: 0 };
    const aMax = { x: 2, y: 2, z: 2 };
    const bMin = { x: 1, y: 1, z: 1 };
    const bMax = { x: 3, y: 3, z: 3 };

    const kernelMs = timeMs(() => {
      kernel.test_aabb_aabb(
        aMin.x, aMin.y, aMin.z, aMax.x, aMax.y, aMax.z,
        bMin.x, bMin.y, bMin.z, bMax.x, bMax.y, bMax.z
      );
    }, 200_000);

    const typescriptMs = timeMs(() => {
      const hit =
        aMin.x <= bMax.x && aMax.x >= bMin.x &&
        aMin.y <= bMax.y && aMax.y >= bMin.y &&
        aMin.z <= bMax.z && aMax.z >= bMin.z;
      if (hit) { /* keep the result live */ }
    }, 200_000);

    record('test_aabb_aabb (1 call)', kernelMs, typescriptMs, 'per-call boundary');
  });

  it('local avoidance', () => {
    const makeBodies = () => Array.from({ length: 64 }, (_, index) => ({
      x: (index % 8) * 0.3,
      z: Math.floor(index / 8) * 0.3,
      radius: 0.5,
      weight: 1
    }));

    const kernelMs = timeMs(() => { resolveOverlaps(makeBodies(), { iterations: 4 }); }, 2_000);
    const typescriptMs = timeMs(() => { resolveOverlapsTypeScript(makeBodies(), 0.25, 4); }, 2_000);
    record('resolve_overlaps (64 bodies)', kernelMs, typescriptMs, 'O(n^2) per tick');
  });

  it('mesh decimation', () => {
    const geometry = new THREE.SphereGeometry(1, 96, 64);
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    const input = {
      positions: position.array as ArrayLike<number>,
      indices: index.array as ArrayLike<number>,
      vertexCount: position.count,
      indexCount: index.count,
      cellSize: 2 / 32
    };

    const kernelMs = timeMs(() => { simplifyMesh(input); }, 20);
    const typescriptMs = timeMs(() => { simplifyMeshTypeScript(input); }, 20);
    record('simplify_mesh (12k tris)', kernelMs, typescriptMs, 'once per model load');
  });

  it('occlusion raster and test', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    camera.position.set(0, 6, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const view = {
      viewProjection: new Float32Array(vp.elements),
      width: OCCLUSION_WIDTH,
      height: OCCLUSION_HEIGHT
    };

    const boxes: number[] = [];
    for (let index = 0; index < 256; index += 1) {
      const x = (index % 16) * 2 - 16;
      const z = Math.floor(index / 16) * -2;
      boxes.push(x, 0, z, x + 1.5, 3, z + 1.5);
    }
    const occluders = new Float32Array(boxes);
    const depthKernel = new Float32Array(OCCLUSION_WIDTH * OCCLUSION_HEIGHT);
    const depthTypeScript = new Float32Array(OCCLUSION_WIDTH * OCCLUSION_HEIGHT);

    const rasterKernelMs = timeMs(() => { rasterizeOccluders(occluders, view, depthKernel); }, 40);
    const rasterTypeScriptMs = timeMs(() => { rasterizeOccludersTypeScript(occluders, view, depthTypeScript); }, 40);
    record('rasterize_occluders (256 boxes)', rasterKernelMs, rasterTypeScriptMs, 'on camera move only');

    const candidates = new Float32Array(36 * 6);
    for (let index = 0; index < 36; index += 1) {
      candidates.set([index - 18, 0, -10, index - 17, 2, -9], index * 6);
    }
    const testKernelMs = timeMs(() => { testOcclusion(candidates, view, depthKernel); }, 2_000);
    const testTypeScriptMs = timeMs(() => { testOcclusionTypeScript(candidates, view, depthTypeScript); }, 2_000);
    record('test_occlusion (36 boxes)', testKernelMs, testTypeScriptMs, 'every frame');
  });

  it('chunk payload scan', () => {
    const objects = Array.from({ length: 400 }, (_, index) => ({
      id: `o${index}`, name: `Object, with ] separators ${index}`, value: index
    }));
    const bytes = new TextEncoder().encode(JSON.stringify({ chunkId: 'c', objects }));
    const start = findObjectsArrayStart(bytes) + 1;

    const kernelMs = timeMs(() => { scanJsonArrayRanges(bytes, start); }, 200);
    const typescriptMs = timeMs(() => { scanJsonArrayRangesTypeScript(bytes, start); }, 200);
    record('scan_json_array (400 objects)', kernelMs, typescriptMs, 'per network chunk');
  });

  it('navigation bake across grid sizes', () => {
    // The kernel path also labels connected regions, which the TypeScript path does
    // not do at all - so this is not like-for-like. What matters is where the dense
    // kernel pass overtakes the sparse TypeScript rasteriser, so the grid is swept
    // rather than sampled once.
    for (const size of [64, 128, 256, 512]) {
      const scene: StudioObject[] = [];
      const blockCount = Math.floor((size * size) / 64);
      for (let index = 0; index < blockCount; index += 1) {
        scene.push({
          id: `b${index}`,
          name: `b${index}`,
          type: 'block',
          position: {
            x: ((index * 37) % size) + 0.5,
            y: 1,
            z: ((index * 91) % size) + 0.5
          },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1.5, y: 2, z: 1.5 },
          color: '#6366f1'
        });
      }
      const options = { cellSize: 1, agentRadius: 0.4, bounds: { minX: 0, minZ: 0, maxX: size, maxZ: size } };
      const iterations = size >= 512 ? 5 : 15;

      const kernelMs = timeMs(() => { buildNavGrid(scene, options); }, iterations);
      const typescriptMs = timeMs(() => { buildNavGrid(scene, { ...options, useKernel: false }); }, iterations);
      record(
        `bake_nav_grid (${size}x${size})`,
        kernelMs,
        typescriptMs,
        `${blockCount} boxes, kernel also labels regions`
      );
    }
  });

  it('navigation bake, isolating the region flood fill', () => {
    // Zero blocking boxes: the kernel still clears every cell and flood fills the
    // whole grid, while the TypeScript path has nothing to rasterise. The gap is the
    // price of region labels alone.
    for (const size of [256, 512]) {
      const options = { cellSize: 1, agentRadius: 0.4, bounds: { minX: 0, minZ: 0, maxX: size, maxZ: size } };
      const kernelMs = timeMs(() => { buildNavGrid([], options); }, 10);
      const typescriptMs = timeMs(() => { buildNavGrid([], { ...options, useKernel: false }); }, 10);
      record(`bake_nav_grid (${size}x${size}, 0 boxes)`, kernelMs, typescriptMs, 'clear + flood fill only');
    }
  });

  it('prints the table', () => {
    const width = Math.max(...rows.map((row) => row.name.length));
    console.log('\nkernel versus TypeScript (lower is better)\n');
    for (const row of rows) {
      const ratio = row.kernelMs / row.typescriptMs;
      const verdict = ratio < 0.9 ? 'faster' : ratio > 1.1 ? 'SLOWER' : 'level';
      // Values are already milliseconds. Sub-microsecond rows read better in ns.
      const unit = Math.max(row.kernelMs, row.typescriptMs) < 0.001 ? 1e6 : 1;
      const suffix = unit === 1e6 ? 'ns' : 'ms';
      console.log(
        `  ${row.name.padEnd(width)}  kernel ${(row.kernelMs * unit).toFixed(2).padStart(9)} ${suffix}  ` +
        `ts ${(row.typescriptMs * unit).toFixed(2).padStart(9)} ${suffix}  ` +
        `${ratio.toFixed(2)}x ${verdict.padEnd(6)}  ${row.note}`
      );
    }
    console.log('');
    expect(rows.length).toBeGreaterThan(5);
  });
});
