// Pure sculpt operations. Every brush returns a fresh TerrainData so the Studio
// history store can snapshot it and undo a whole stroke in one step.

import {
  TERRAIN_MAX_HEIGHT,
  TERRAIN_MATERIALS,
  TerrainBrush,
  TerrainData
} from './advancedTypes';
import { decodeTerrainGrid, encodeTerrainGrid, TerrainGrid } from './terrainCodec';

function neighbourhoodAverage(grid: TerrainGrid, x: number, z: number): number {
  let sum = 0;
  let count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.depth) continue;
      sum += grid.heights[nz * grid.width + nx];
      count += 1;
    }
  }
  return count > 0 ? sum / count : grid.heights[z * grid.width + x];
}

/** Applies a radial brush centred on a grid cell. Out-of-range cells are ignored. */
export function applyTerrainBrush(
  data: TerrainData,
  centreX: number,
  centreZ: number,
  brush: TerrainBrush
): TerrainData {
  const grid = decodeTerrainGrid(data);
  if (!grid) return data;

  const radius = Math.max(1, Math.min(24, brush.radius));
  const strength = Math.max(0, Math.min(8, brush.strength));
  const materialIndex = Math.max(0, TERRAIN_MATERIALS.indexOf(brush.material));
  const radiusSq = radius * radius;
  const originalHeights = new Uint8Array(grid.heights);

  for (let z = Math.max(0, centreZ - radius); z <= Math.min(grid.depth - 1, centreZ + radius); z++) {
    for (let x = Math.max(0, centreX - radius); x <= Math.min(grid.width - 1, centreX + radius); x++) {
      const dx = x - centreX;
      const dz = z - centreZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;
      const falloff = 1 - Math.sqrt(distSq) / radius;
      const index = z * grid.width + x;
      const current = originalHeights[index];

      switch (brush.tool) {
        case 'raise':
          grid.heights[index] = Math.round(current + strength * falloff);
          break;
        case 'lower':
          grid.heights[index] = Math.round(current - strength * falloff);
          break;
        case 'erase':
          grid.heights[index] = 0;
          break;
        case 'flatten':
          grid.heights[index] = Math.round(current + (brush.flattenHeight - current) * falloff);
          break;
        case 'smooth': {
          const average = neighbourhoodAverage(
            { ...grid, heights: originalHeights },
            x,
            z
          );
          grid.heights[index] = Math.round(current + (average - current) * falloff);
          break;
        }
        case 'paint':
          grid.materials[index] = materialIndex;
          break;
        default:
          break;
      }
      grid.heights[index] = Math.min(
        TERRAIN_MAX_HEIGHT,
        Math.max(0, grid.heights[index])
      );
    }
  }

  return encodeTerrainGrid(grid);
}

export function terrainStats(data: TerrainData): {
  cells: number;
  filled: number;
  maxHeight: number;
  quadsEstimate: number;
} {
  const grid = decodeTerrainGrid(data);
  if (!grid) return { cells: 0, filled: 0, maxHeight: 0, quadsEstimate: 0 };
  let filled = 0;
  let maxHeight = 0;
  for (const h of grid.heights) {
    if (h > 0) filled += 1;
    if (h > maxHeight) maxHeight = h;
  }
  return {
    cells: grid.width * grid.depth,
    filled,
    maxHeight,
    quadsEstimate: filled * 2
  };
}
