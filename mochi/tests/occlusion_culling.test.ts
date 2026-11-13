// Software occlusion culling: the kernel rasteriser against the TypeScript
// reference, and the runtime pass that decides what to hide.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initWasmPhysics } from '../src/engine/physics/wasmPhysics';
import {
  OCCLUSION_HEIGHT,
  OCCLUSION_WIDTH,
  rasterizeOccluders,
  rasterizeOccludersTypeScript,
  testOcclusion,
  testOcclusionTypeScript,
  type OcclusionView
} from '../src/engine/scene/occlusionRaster';
import {
  clearOcclusionTargets,
  getOcclusionStats,
  registerOcclusionTarget,
  setOccluderBoxes,
  updateOcclusionCulling
} from '../src/engine/scene/occlusionCulling';

const PIXELS = OCCLUSION_WIDTH * OCCLUSION_HEIGHT;

/** Camera at z=10 looking at the origin, so -Z is "into the scene". */
function makeView(): { view: OcclusionView; camera: THREE.PerspectiveCamera } {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const vp = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  return {
    view: {
      viewProjection: new Float32Array(vp.elements),
      width: OCCLUSION_WIDTH,
      height: OCCLUSION_HEIGHT
    },
    camera
  };
}

function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number[] {
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

/** A wall across the whole view at z = 0, from a camera at z = 10. */
const WALL = box(-20, -20, -0.5, 20, 20, 0.5);

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
});

describe('occlusion raster', () => {
  it('covers the view with a wall in front of the camera', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS);
    expect(rasterizeOccluders(new Float32Array(WALL), view, depth)).toBe(1);

    let covered = 0;
    for (let index = 0; index < depth.length; index += 1) {
      if (depth[index] > 0) covered += 1;
    }
    // The wall spans far past the frustum at 10 m, so it fills the buffer.
    expect(covered).toBe(PIXELS);
  });

  it('leaves the buffer empty when there are no occluders', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS).fill(0.5);
    expect(rasterizeOccluders(new Float32Array(0), view, depth)).toBe(0);
    expect(depth.every((value) => value === 0)).toBe(true);
  });

  it('hides a box behind the wall and keeps one in front of it', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS);
    rasterizeOccluders(new Float32Array(WALL), view, depth);

    const candidates = new Float32Array([
      ...box(-1, -1, -11, 1, 1, -9), // behind the wall
      ...box(-1, -1, 4, 1, 1, 6) // between camera and wall
    ]);
    const flags = testOcclusion(candidates, view, depth);
    expect(Array.from(flags)).toEqual([1, 0]);
  });

  it('does not hide a box that pokes out beside a narrow wall', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS);
    rasterizeOccluders(new Float32Array(box(-2, -2, -0.5, 2, 2, 0.5)), view, depth);

    const candidates = new Float32Array([
      ...box(-1, -1, -11, 1, 1, -9), // directly behind: hidden
      ...box(6, -1, -11, 8, 1, -9) // off to the side: visible
    ]);
    expect(Array.from(testOcclusion(candidates, view, depth))).toEqual([1, 0]);
  });

  it('reports a box straddling the camera as visible', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS);
    rasterizeOccluders(new Float32Array(WALL), view, depth);

    // Spans z = 8..12, so it crosses the eye plane at z = 10.
    const candidates = new Float32Array(box(-1, -1, 8, 1, 1, 12));
    expect(Array.from(testOcclusion(candidates, view, depth))).toEqual([0]);
  });

  it('agrees with the TypeScript reference on classification', () => {
    const { view } = makeView();
    const wall = new Float32Array([
      ...box(-6, -6, -0.5, 6, 6, 0.5),
      ...box(-3, -8, -20, 3, 2, -18)
    ]);

    const kernelDepth = new Float32Array(PIXELS);
    const referenceDepth = new Float32Array(PIXELS);
    rasterizeOccluders(wall, view, kernelDepth);
    rasterizeOccludersTypeScript(wall, view, referenceDepth);

    let kernelCovered = 0;
    let referenceCovered = 0;
    for (let index = 0; index < PIXELS; index += 1) {
      if (kernelDepth[index] > 0) kernelCovered += 1;
      if (referenceDepth[index] > 0) referenceCovered += 1;
    }
    expect(Math.abs(kernelCovered - referenceCovered)).toBeLessThan(PIXELS * 0.02);

    const candidates: number[] = [];
    for (let x = -8; x <= 8; x += 2) {
      for (let z = -22; z <= 8; z += 3) {
        candidates.push(...box(x - 0.6, -1, z - 0.6, x + 0.6, 1, z + 0.6));
      }
    }
    const input = new Float32Array(candidates);
    const fromKernel = testOcclusion(input, view, kernelDepth);
    const fromReference = testOcclusionTypeScript(input, view, referenceDepth);
    expect(Array.from(fromKernel)).toEqual(Array.from(fromReference));
  });

  it('matches the reference when nothing occludes', () => {
    const { view } = makeView();
    const depth = new Float32Array(PIXELS);
    rasterizeOccluders(new Float32Array(0), view, depth);
    const candidates = new Float32Array(box(-1, -1, -11, 1, 1, -9));
    expect(Array.from(testOcclusion(candidates, view, depth))).toEqual([0]);
    expect(Array.from(testOcclusionTypeScript(candidates, view, depth))).toEqual([0]);
  });
});

describe('occlusion pass', () => {
  beforeEach(() => {
    clearOcclusionTargets();
  });

  function meshAt(x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(x, y, z);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  /** Sixteen copies of the wall: enough to pass the self-gating threshold. */
  function occluderSet(): Float32Array {
    const boxes: number[] = [];
    for (let index = 0; index < 16; index += 1) boxes.push(...WALL);
    return new Float32Array(boxes);
  }

  it('does nothing below the target threshold', () => {
    const { camera } = makeView();
    setOccluderBoxes(occluderSet());
    for (let index = 0; index < 4; index += 1) registerOcclusionTarget(meshAt(index, 0, -10));

    expect(updateOcclusionCulling(camera)).toBeNull();
    expect(getOcclusionStats()).toBeNull();
  });

  it('hides the targets that are behind cover', () => {
    const { camera } = makeView();
    setOccluderBoxes(occluderSet());

    const hidden: THREE.Mesh[] = [];
    const visible: THREE.Mesh[] = [];
    for (let index = 0; index < 4; index += 1) {
      const behind = meshAt(index - 1.5, 0, -12);
      const front = meshAt(index - 1.5, 0, 5);
      hidden.push(behind);
      visible.push(front);
      registerOcclusionTarget(behind);
      registerOcclusionTarget(front);
    }

    const stats = updateOcclusionCulling(camera);
    expect(stats).not.toBeNull();
    expect(stats!.occluded).toBe(4);
    expect(hidden.every((mesh) => mesh.visible === false)).toBe(true);
    expect(visible.every((mesh) => mesh.visible === true)).toBe(true);
  });

  it('never re-shows something the distance pass culled', () => {
    const { camera } = makeView();
    setOccluderBoxes(occluderSet());

    for (let index = 0; index < 8; index += 1) {
      const mesh = meshAt(index - 3.5, 0, 5);
      mesh.userData.distanceCulled = true;
      registerOcclusionTarget(mesh);
    }

    updateOcclusionCulling(camera);
    expect(getOcclusionStats()!.occluded).toBe(0);
  });

  it('restores hidden targets when the pass stops running', () => {
    const { camera } = makeView();
    setOccluderBoxes(occluderSet());

    const targets: THREE.Mesh[] = [];
    for (let index = 0; index < 8; index += 1) {
      const mesh = meshAt(index - 3.5, 0, -12);
      targets.push(mesh);
      registerOcclusionTarget(mesh);
    }

    expect(updateOcclusionCulling(camera)!.occluded).toBe(8);
    expect(targets.every((mesh) => mesh.visible === false)).toBe(true);

    // Drop the occluders: the pass must hand visibility back, not leave it stale.
    setOccluderBoxes(new Float32Array(0));
    expect(updateOcclusionCulling(camera)).toBeNull();
    expect(targets.every((mesh) => mesh.visible === true)).toBe(true);
  });

  it('stops tracking a target once it is unregistered', () => {
    const { camera } = makeView();
    setOccluderBoxes(occluderSet());

    const cancels: Array<() => void> = [];
    for (let index = 0; index < 8; index += 1) {
      cancels.push(registerOcclusionTarget(meshAt(index - 3.5, 0, -12)));
    }
    cancels.forEach((cancel) => cancel());

    expect(updateOcclusionCulling(camera)).toBeNull();
  });
});
