// Nav-grid bake in the Rust/WASM kernel.
//
// The kernel rasterises blocking footprints and labels connected walkable regions
// in one pass. TypeScript keeps its own rasteriser (navGridFromScene) as the
// fallback and as the reference the parity test compares against, because a bake
// that silently disagrees with the renderer is worse than a slow one.

import { getWasmKernel } from '../physics/wasmPhysics';

export interface NavBakeRequest {
  /** Four floats per box: minX, maxX, minZ, maxZ in world space. */
  boxes: Float32Array;
  boxCount: number;
  originX: number;
  originZ: number;
  cellSize: number;
  width: number;
  height: number;
  agentRadius: number;
}

export interface NavBakeResult {
  /** 1 = walkable, 0 = blocked. */
  walkable: Uint8Array;
  /** 1..=regionCount for walkable cells, 0 for blocked ones. */
  regions: Uint32Array;
  regionCount: number;
}

/** Returns null when the kernel is not loaded, so callers fall back to TypeScript. */
export function bakeNavGridWasm(request: NavBakeRequest): NavBakeResult | null {
  const kernel = getWasmKernel();
  if (!kernel) return null;

  const cells = request.width * request.height;
  if (cells <= 0) return null;

  // alloc_f32_buffer allocates four bytes per unit, so a byte array of `cells`
  // needs a quarter of that and a u32 array needs one unit per cell.
  const boxUnits = Math.max(request.boxes.length, 4);
  const walkableUnits = Math.ceil(cells / 4);
  const boxesPtr = kernel.alloc_f32_buffer(boxUnits);
  const walkablePtr = kernel.alloc_f32_buffer(walkableUnits);
  const regionPtr = kernel.alloc_f32_buffer(cells);

  try {
    // Views are created after every allocation: growing memory detaches buffers.
    if (request.boxes.length > 0) {
      new Float32Array(kernel.memory.buffer, boxesPtr, request.boxes.length).set(request.boxes);
    }

    const regionCount = kernel.bake_nav_grid(
      boxesPtr,
      request.boxCount,
      request.originX,
      request.originZ,
      request.cellSize,
      request.width,
      request.height,
      request.agentRadius,
      walkablePtr,
      regionPtr
    );

    const walkable = new Uint8Array(new Uint8Array(kernel.memory.buffer, walkablePtr, cells));
    const regions = new Uint32Array(new Uint32Array(kernel.memory.buffer, regionPtr, cells));
    return { walkable, regions, regionCount };
  } finally {
    kernel.free_f32_buffer(boxesPtr, boxUnits);
    kernel.free_f32_buffer(walkablePtr, walkableUnits);
    kernel.free_f32_buffer(regionPtr, cells);
  }
}
