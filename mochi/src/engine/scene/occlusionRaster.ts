// Kernel bridge for software occlusion culling.
//
// The maths lives in `occlusionReference.ts`; this module only marshals buffers and
// falls back to the reference when the kernel never loaded.

import { getWasmKernel } from '../physics/wasmPhysics';
import {
  OCCLUSION_DEPTH_BIAS,
  OCCLUSION_INSET,
  OCCLUSION_MAX_TEST_PIXELS,
  rasterizeOccludersTypeScript,
  testOcclusionTypeScript,
  type OcclusionTestOptions,
  type OcclusionView
} from './occlusionReference';

export {
  OCCLUSION_DEPTH_BIAS,
  OCCLUSION_HEIGHT,
  OCCLUSION_INSET,
  OCCLUSION_MAX_TEST_PIXELS,
  OCCLUSION_WIDTH,
  rasterizeOccludersTypeScript,
  testOcclusionTypeScript
} from './occlusionReference';
export type { OcclusionTestOptions, OcclusionView } from './occlusionReference';

/** Rasterises occluders with the kernel when it is loaded. Returns boxes drawn. */
export function rasterizeOccluders(
  boxes: ArrayLike<number>,
  view: OcclusionView,
  depth: Float32Array
): number {
  const kernel = getWasmKernel();
  const boxCount = Math.floor(boxes.length / 6);
  if (!kernel || boxCount === 0) return rasterizeOccludersTypeScript(boxes, view, depth);

  const { width, height } = view;
  const boxPtr = kernel.alloc_f32_buffer(boxCount * 6);
  const viewPtr = kernel.alloc_f32_buffer(16);
  const depthPtr = kernel.alloc_f32_buffer(width * height);

  try {
    // Views after every allocation: growing memory detaches earlier buffers.
    new Float32Array(kernel.memory.buffer, boxPtr, boxCount * 6).set(boxes);
    new Float32Array(kernel.memory.buffer, viewPtr, 16).set(view.viewProjection);
    const drawn = kernel.rasterize_occluders(
      boxPtr,
      boxCount,
      viewPtr,
      width,
      height,
      depthPtr
    );
    depth.set(new Float32Array(kernel.memory.buffer, depthPtr, width * height));
    return drawn;
  } finally {
    kernel.free_f32_buffer(boxPtr, boxCount * 6);
    kernel.free_f32_buffer(viewPtr, 16);
    kernel.free_f32_buffer(depthPtr, width * height);
  }
}

/** Tests candidates with the kernel when it is loaded. One byte per candidate. */
export function testOcclusion(
  candidates: ArrayLike<number>,
  view: OcclusionView,
  depth: Float32Array,
  options: OcclusionTestOptions = {}
): Uint8Array {
  const kernel = getWasmKernel();
  const boxCount = Math.floor(candidates.length / 6);
  if (!kernel || boxCount === 0) {
    return testOcclusionTypeScript(candidates, view, depth, options);
  }

  const { width, height } = view;
  const boxPtr = kernel.alloc_f32_buffer(boxCount * 6);
  const viewPtr = kernel.alloc_f32_buffer(16);
  const depthPtr = kernel.alloc_f32_buffer(width * height);
  const flagUnits = Math.max(1, Math.ceil(boxCount / 4));
  const flagPtr = kernel.alloc_f32_buffer(flagUnits);

  try {
    new Float32Array(kernel.memory.buffer, boxPtr, boxCount * 6).set(candidates);
    new Float32Array(kernel.memory.buffer, viewPtr, 16).set(view.viewProjection);
    new Float32Array(kernel.memory.buffer, depthPtr, width * height).set(depth);

    kernel.test_occlusion(
      boxPtr,
      boxCount,
      viewPtr,
      width,
      height,
      depthPtr,
      options.depthBias ?? OCCLUSION_DEPTH_BIAS,
      options.inset ?? OCCLUSION_INSET,
      options.maxPixels ?? OCCLUSION_MAX_TEST_PIXELS,
      flagPtr
    );

    const raw = new Uint8Array(kernel.memory.buffer, flagPtr, boxCount);
    return new Uint8Array(raw);
  } finally {
    kernel.free_f32_buffer(boxPtr, boxCount * 6);
    kernel.free_f32_buffer(viewPtr, 16);
    kernel.free_f32_buffer(depthPtr, width * height);
    kernel.free_f32_buffer(flagPtr, flagUnits);
  }
}
