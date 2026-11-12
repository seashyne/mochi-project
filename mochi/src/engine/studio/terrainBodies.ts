// Static collider approximation for voxel terrain. Equal-height cells are merged
// into rectangles, so a flat field costs one box per row instead of 4096 boxes.

import { RigidBody } from '../physics';
import type { StudioObject } from './types';
import { decodeTerrainGrid, TerrainGrid } from './terrainCodec';

export const MAX_TERRAIN_BODIES = 512;

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
}

function quantize(value: number, step: number): number {
  return step <= 1 ? value : Math.max(0, Math.round(value / step) * step);
}

function buildRects(grid: TerrainGrid, step: number): Rect[] {
  const rects: Rect[] = [];
  const active = new Map<string, Rect>();

  for (let z = 0; z < grid.depth; z++) {
    const seen = new Set<string>();
    let x = 0;
    while (x < grid.width) {
      const h = quantize(grid.heights[z * grid.width + x], step);
      let x1 = x + 1;
      while (x1 < grid.width && quantize(grid.heights[z * grid.width + x1], step) === h) x1 += 1;
      if (h > 0) {
        const key = `${x}:${x1}:${h}`;
        seen.add(key);
        const existing = active.get(key);
        if (existing) existing.z1 = z + 1;
        else {
          const rect: Rect = { x0: x, x1, z0: z, z1: z + 1, height: h };
          active.set(key, rect);
          rects.push(rect);
        }
      }
      x = x1;
    }
    for (const key of Array.from(active.keys())) {
      if (!seen.has(key)) active.delete(key);
    }
  }
  return rects;
}

/**
 * Terrain has no single collider shape, so it contributes a set of static boxes.
 * Rotation is intentionally not applied (a rotated voxel grid would need OBB
 * per rect); scale and position are honoured so editor and runtime agree.
 */
export function buildTerrainBodies(obj: StudioObject): RigidBody[] {
  if (!obj.terrain) return [];
  const grid = decodeTerrainGrid(obj.terrain);
  if (!grid) return [];

  let rects = buildRects(grid, 1);
  for (const step of [2, 4, 8]) {
    if (rects.length <= MAX_TERRAIN_BODIES) break;
    rects = buildRects(grid, step);
  }
  rects = rects.slice(0, MAX_TERRAIN_BODIES);

  const sx = Math.max(0.05, obj.scale?.x ?? 1);
  const sy = Math.max(0.05, obj.scale?.y ?? 1);
  const sz = Math.max(0.05, obj.scale?.z ?? 1);
  const originX = -(grid.width * grid.cellSize) / 2;
  const originZ = -(grid.depth * grid.cellSize) / 2;
  const p = obj.position;

  return rects.map((rect, index) => {
    const width = (rect.x1 - rect.x0) * grid.cellSize * sx;
    const depth = (rect.z1 - rect.z0) * grid.cellSize * sz;
    const height = rect.height * grid.voxelHeight * sy;
    return new RigidBody({
      id: `terrain_${obj.id}_${index}`,
      type: 'static',
      position: {
        x: p.x + (originX + ((rect.x0 + rect.x1) / 2) * grid.cellSize) * sx,
        y: p.y + height / 2,
        z: p.z + (originZ + ((rect.z0 + rect.z1) / 2) * grid.cellSize) * sz
      },
      shape: {
        type: 'box',
        halfExtents: { x: width / 2, y: height / 2, z: depth / 2 }
      },
      userData: { ownerId: obj.id, terrain: true }
    });
  });
}
