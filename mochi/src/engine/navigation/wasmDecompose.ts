// Navmesh decomposition in the Rust/WASM kernel.
//
// Same discipline as the nav bake: the kernel does the CPU-bound scan, TypeScript
// keeps its own implementation as the fallback and as the reference the parity test
// compares against. A decomposition that silently disagrees with the reference
// would put regions in the wrong place, which is worse than a slow bake.

import { getWasmKernel } from '../physics/wasmPhysics';
import type { NavGrid } from './navGrid';
import type { NavRect } from './navMesh';

/** Returns null when the kernel is not loaded, so callers fall back to TypeScript. */
export function decomposeNavMeshWasm(grid: NavGrid): NavRect[] | null {
  const kernel = getWasmKernel();
  if (!kernel) return null;

  const { width, height } = grid;
  const cells = width * height;
  if (cells <= 0) return null;

  const walkable = new Uint8Array(cells);
  let walkableCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid.isWalkable(x, y)) {
        walkable[y * width + x] = 1;
        walkableCount += 1;
      }
    }
  }
  if (walkableCount === 0) return [];

  // A rectangle never covers less than one cell, so the walkable count is an exact
  // upper bound on the output length. Sizing it exactly keeps the allocation small
  // on sparse maps instead of reserving a slot per cell.
  const maxRects = walkableCount;
  const walkableUnits = Math.ceil(cells / 4);
  const rectUnits = maxRects * 4;

  const walkablePtr = kernel.alloc_f32_buffer(walkableUnits);
  const rectPtr = kernel.alloc_f32_buffer(rectUnits);

  try {
    // Views are created after every allocation: growing memory detaches buffers.
    new Uint8Array(kernel.memory.buffer, walkablePtr, cells).set(walkable);

    const count = kernel.decompose_navmesh(walkablePtr, width, height, rectPtr, maxRects);
    if (count === 0) return null;

    const raw = new Uint32Array(kernel.memory.buffer, rectPtr, count * 4);
    const rects: NavRect[] = new Array(count);
    for (let index = 0; index < count; index += 1) {
      const base = index * 4;
      rects[index] = { x0: raw[base], y0: raw[base + 1], x1: raw[base + 2], y1: raw[base + 3] };
    }
    return rects;
  } finally {
    kernel.free_f32_buffer(walkablePtr, walkableUnits);
    kernel.free_f32_buffer(rectPtr, rectUnits);
  }
}
