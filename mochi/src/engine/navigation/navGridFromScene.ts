// Builds a navigation grid from the Studio scene data.
//
// Only XZ matters: an object blocks a cell when it collides and its footprint
// overlaps that cell. The agent radius is applied by dilating the blocked set, so
// a path never hugs a wall closer than the character can physically pass.

import type { StudioObject } from '../studio/types';
import { NavGrid } from './navGrid';
import { bakeNavGridWasm } from './wasmBake';

export interface NavGridFromSceneOptions {
  /** Edge length of one cell in metres. Defaults to 1. */
  cellSize?: number;
  /** Extra clearance around blocking objects, in metres. Defaults to 0.4. */
  agentRadius?: number;
  /** Objects ignored for blocking regardless of their flags. */
  ignoreTypes?: string[];
  /** Explicit bounds; defaults to the scene extents plus one cell of padding. */
  bounds?: { minX: number; minZ: number; maxX: number; maxZ: number };
  /**
   * Set false to force the TypeScript rasteriser. The kernel is used whenever it
   * is loaded; the parity test compares the two paths.
   */
  useKernel?: boolean;
}

// Objects a character can walk through or over. Decorations, pickups and other
// agents are not obstacles; terrain and platforms are.
const NON_BLOCKING_TYPES = new Set(['spawn', 'agent', 'coin', 'hazard', 'jump_pad_base', 'jump_pad_ring']);

function isBlocking(object: StudioObject, ignore: Set<string>): boolean {
  if (ignore.has(object.type)) return false;
  if (NON_BLOCKING_TYPES.has(object.type)) return false;
  return object.canCollide !== false;
}

function footprint(object: StudioObject): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfX = Math.abs(object.scale?.x ?? 1) / 2;
  const halfZ = Math.abs(object.scale?.z ?? 1) / 2;
  const x = object.position?.x ?? 0;
  const z = object.position?.z ?? 0;
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

/**
 * Bakes a grid for the given objects. The result is walkable everywhere except
 * under blocking footprints, inflated by `agentRadius`.
 */
export function buildNavGrid(
  objects: StudioObject[],
  options: NavGridFromSceneOptions = {}
): NavGrid {
  const cellSize = options.cellSize ?? 1;
  const radius = Math.max(options.agentRadius ?? 0.4, 0);
  const ignore = new Set(options.ignoreTypes ?? []);

  const blocking = objects.filter((object) => isBlocking(object, ignore));
  const bounds = options.bounds ?? computeBounds(objects, cellSize);

  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const height = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize));
  const origin = { x: bounds.minX, z: bounds.minZ };

  const boxes = new Float32Array(blocking.length * 4);
  blocking.forEach((object, index) => {
    const box = footprint(object);
    boxes[index * 4] = box.minX;
    boxes[index * 4 + 1] = box.maxX;
    boxes[index * 4 + 2] = box.minZ;
    boxes[index * 4 + 3] = box.maxZ;
  });

  // The kernel rasterises and labels regions in one pass. It returns null when it
  // is not loaded, and `useKernel: false` forces the reference path.
  const baked = options.useKernel === false
    ? null
    : bakeNavGridWasm({
        boxes,
        boxCount: blocking.length,
        originX: origin.x,
        originZ: origin.z,
        cellSize,
        width,
        height,
        agentRadius: radius
      });

  if (baked) {
    const blocked = new Uint8Array(baked.walkable.length);
    for (let index = 0; index < blocked.length; index += 1) {
      blocked[index] = baked.walkable[index] ? 0 : 1;
    }
    return new NavGrid({
      width,
      height,
      cellSize,
      origin,
      blocked,
      regions: baked.regions,
      regionCount: baked.regionCount
    });
  }

  return new NavGrid({
    width,
    height,
    cellSize,
    origin,
    blocked: rasterise(blocking, { cellSize, radius, bounds, width, height })
  });
}

/** Reference rasteriser: the same rule the kernel implements. */
function rasterise(
  blocking: StudioObject[],
  geometry: {
    cellSize: number;
    radius: number;
    bounds: { minX: number; minZ: number };
    width: number;
    height: number;
  }
): Uint8Array {
  const { cellSize, radius, bounds, width, height } = geometry;
  const blocked = new Uint8Array(width * height);

  for (const object of blocking) {
    const box = footprint(object);
    // The first cell is the one containing the min edge; the last cell is the one
    // whose span actually overlaps the max edge. Using floor on both ends would
    // mark an extra cell whenever an edge lands exactly on a cell boundary.
    const minCellX = Math.floor((box.minX - radius - bounds.minX) / cellSize);
    const maxCellX = Math.ceil((box.maxX + radius - bounds.minX) / cellSize) - 1;
    const minCellZ = Math.floor((box.minZ - radius - bounds.minZ) / cellSize);
    const maxCellZ = Math.ceil((box.maxZ + radius - bounds.minZ) / cellSize) - 1;

    for (let y = Math.max(0, minCellZ); y <= Math.min(height - 1, maxCellZ); y += 1) {
      for (let x = Math.max(0, minCellX); x <= Math.min(width - 1, maxCellX); x += 1) {
        blocked[y * width + x] = 1;
      }
    }
  }

  return blocked;
}

function computeBounds(objects: StudioObject[], cellSize: number) {
  if (objects.length === 0) return { minX: 0, minZ: 0, maxX: cellSize, maxZ: cellSize };

  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const object of objects) {
    const box = footprint(object);
    minX = Math.min(minX, box.minX);
    minZ = Math.min(minZ, box.minZ);
    maxX = Math.max(maxX, box.maxX);
    maxZ = Math.max(maxZ, box.maxZ);
  }

  // One cell of padding so an agent standing at the edge still has a cell.
  return {
    minX: minX - cellSize,
    minZ: minZ - cellSize,
    maxX: maxX + cellSize,
    maxZ: maxZ + cellSize
  };
}
