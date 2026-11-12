// Compact, deterministic terrain storage. Two RLE strings keep a 64x64 grid
// inside a 64KB draft manifest while remaining plain JSON (no binary blobs).

import {
  TERRAIN_MATERIALS,
  TERRAIN_MAX_DEPTH,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_MAX_WIDTH,
  TerrainData,
  TerrainMaterialId
} from './advancedTypes';

export interface TerrainGrid {
  width: number;
  depth: number;
  cellSize: number;
  voxelHeight: number;
  heights: Uint8Array;
  materials: Uint8Array;
}

const RLE_PAIR = /^(\d+)\*(\d+)$/;

export function encodeRle(values: ArrayLike<number>): string {
  if (values.length === 0) return '';
  const parts: string[] = [];
  let current = values[0];
  let run = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] === current) {
      run += 1;
    } else {
      parts.push(`${current}*${run}`);
      current = values[i];
      run = 1;
    }
  }
  parts.push(`${current}*${run}`);
  return parts.join(',');
}

export function decodeRle(raw: unknown, expectedLength: number, maxValue: number): Uint8Array | null {
  if (typeof raw !== 'string' || !raw || expectedLength <= 0) return null;
  const out = new Uint8Array(expectedLength);
  let cursor = 0;
  for (const token of raw.split(',')) {
    const match = RLE_PAIR.exec(token);
    if (!match) return null;
    const value = Number(match[1]);
    const count = Number(match[2]);
    if (!Number.isInteger(value) || !Number.isInteger(count) || count <= 0) return null;
    if (value > maxValue || cursor + count > expectedLength) return null;
    out.fill(value, cursor, cursor + count);
    cursor += count;
  }
  return cursor === expectedLength ? out : null;
}

export function terrainOrigin(
  data: Pick<TerrainData, 'width' | 'depth' | 'cellSize'>
): { x: number; z: number } {
  return {
    x: -(data.width * data.cellSize) / 2,
    z: -(data.depth * data.cellSize) / 2
  };
}

/** Gentle deterministic hills so a newly inserted Terrain is immediately visible. */
export function createTerrainData(width = 16, depth = 16): TerrainData {
  const w = Math.min(TERRAIN_MAX_WIDTH, Math.max(2, Math.round(width)));
  const d = Math.min(TERRAIN_MAX_DEPTH, Math.max(2, Math.round(depth)));
  const heights = new Uint8Array(w * d);
  const materials = new Uint8Array(w * d);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const wave = Math.sin(x * 0.42) * Math.cos(z * 0.38) + Math.sin((x + z) * 0.2);
      const level = Math.round(1 + (wave + 2) * 0.9);
      heights[z * w + x] = Math.min(TERRAIN_MAX_HEIGHT, Math.max(1, level));
      materials[z * w + x] = level >= 4 ? 1 : 0; // rock on peaks, grass below
    }
  }
  return {
    width: w,
    depth: d,
    cellSize: 2,
    voxelHeight: 2,
    heights: encodeRle(heights),
    materials: encodeRle(materials)
  };
}

export function decodeTerrainGrid(data: TerrainData): TerrainGrid | null {
  const w = Math.min(TERRAIN_MAX_WIDTH, Math.max(1, Math.round(data.width)));
  const d = Math.min(TERRAIN_MAX_DEPTH, Math.max(1, Math.round(data.depth)));
  const count = w * d;
  const heights = decodeRle(data.heights, count, TERRAIN_MAX_HEIGHT);
  const materials = decodeRle(data.materials, count, TERRAIN_MATERIALS.length - 1);
  if (!heights || !materials) return null;
  return {
    width: w,
    depth: d,
    cellSize: Math.min(16, Math.max(0.25, data.cellSize)),
    voxelHeight: Math.min(16, Math.max(0.25, data.voxelHeight)),
    heights,
    materials
  };
}

export function encodeTerrainGrid(grid: TerrainGrid): TerrainData {
  return {
    width: grid.width,
    depth: grid.depth,
    cellSize: grid.cellSize,
    voxelHeight: grid.voxelHeight,
    heights: encodeRle(grid.heights),
    materials: encodeRle(grid.materials)
  };
}

export function terrainMaterialAt(grid: TerrainGrid, x: number, z: number): TerrainMaterialId {
  const index = z * grid.width + x;
  const id = TERRAIN_MATERIALS[grid.materials[index] ?? 0];
  return id ?? 'grass';
}

/** Rejects hostile manifests: unknown fields, oversized grids, malformed RLE. */
export function normalizeTerrainData(raw: unknown): TerrainData | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const width = Math.min(TERRAIN_MAX_WIDTH, Math.max(1, Number(rec.width) || 0));
  const depth = Math.min(TERRAIN_MAX_DEPTH, Math.max(1, Number(rec.depth) || 0));
  const cellSize = Math.min(16, Math.max(0.25, Number(rec.cellSize) || 2));
  const voxelHeight = Math.min(16, Math.max(0.25, Number(rec.voxelHeight) || 2));
  const heights = decodeRle(rec.heights, width * depth, TERRAIN_MAX_HEIGHT);
  const materials = decodeRle(rec.materials, width * depth, TERRAIN_MATERIALS.length - 1);
  if (!heights || !materials) return null;
  return {
    width,
    depth,
    cellSize,
    voxelHeight,
    heights: encodeRle(heights),
    materials: encodeRle(materials)
  };
}

/** Converts a local-space point into grid cell indices, or null when outside. */
export function terrainCellAt(
  grid: TerrainGrid,
  local: { x: number; z: number }
): { x: number; z: number } | null {
  const origin = terrainOrigin(grid);
  const x = Math.floor((local.x - origin.x) / grid.cellSize);
  const z = Math.floor((local.z - origin.z) / grid.cellSize);
  if (x < 0 || z < 0 || x >= grid.width || z >= grid.depth) return null;
  return { x, z };
}
