// Pure viewport interaction helpers: terrain sculpt picking and object picking.
// Extracted so StudioScene can stay within the SRP line ceiling.

import type * as THREE from 'three';
import type { StudioObject } from './types';
import type { TerrainBrush, TerrainData } from './advancedTypes';
import { createTerrainData, decodeTerrainGrid, terrainCellAt } from './terrainCodec';
import { applyTerrainBrush } from './terrainEdit';
import { pickStudioObject } from './studioViewportInput';

export interface StudioEntry {
  data: StudioObject;
  mesh: THREE.Object3D;
}

export interface SculptHit {
  id: string;
  terrain: TerrainData;
}

function meshesOf(entries: Map<string, StudioEntry>): THREE.Object3D[] {
  return Array.from(entries.values()).map((entry) => entry.mesh);
}

/** Ray-picks a Terrain object and applies one brush stroke. Returns null on miss. */
export function sculptTerrainAt(
  camera: THREE.Camera | null,
  entries: Map<string, StudioEntry>,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  brush: TerrainBrush | null
): SculptHit | null {
  if (!camera || !brush) return null;
  const pick = pickStudioObject(camera, meshesOf(entries), canvas, clientX, clientY);
  const id = pick?.root.userData.id as string | undefined;
  const entry = id ? entries.get(id) : undefined;
  if (!id || !entry || entry.data.type !== 'terrain' || !pick) return null;
  const data = entry.data.terrain ?? createTerrainData();
  const grid = decodeTerrainGrid(data);
  if (!grid) return null;
  const cell = terrainCellAt(grid, entry.mesh.worldToLocal(pick.point.clone()));
  if (!cell) return null;
  return { id, terrain: applyTerrainBrush(data, cell.x, cell.z, brush) };
}

/** Resolves the object id under the cursor, walking up to the owning root. */
export function selectionIdAt(
  camera: THREE.Camera | null,
  entries: Map<string, StudioEntry>,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): string | undefined {
  if (!camera) return undefined;
  const pick = pickStudioObject(camera, meshesOf(entries), canvas, clientX, clientY);
  return pick?.root.userData.id as string | undefined;
}
