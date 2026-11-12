// Exposed-face voxel meshing for Terrain objects. Only surfaces next to empty
// or lower cells are emitted, so a flat 64x64 field stays a single top layer.

import * as THREE from 'three';
import { TERRAIN_MATERIAL_COLORS } from './advancedTypes';
import { decodeTerrainGrid, terrainMaterialAt, TerrainGrid } from './terrainCodec';
import type { TerrainData } from './advancedTypes';

const MAX_QUADS = 60_000;

type Point = [number, number, number];

interface MeshBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
  quads: number;
}

function pushQuad(
  buf: MeshBuffers,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  normal: Point,
  color: THREE.Color
): void {
  if (buf.quads >= MAX_QUADS) return;
  buf.quads += 1;
  const vertices = [p0, p1, p2, p0, p2, p3];
  for (const v of vertices) {
    buf.positions.push(v[0], v[1], v[2]);
    buf.normals.push(normal[0], normal[1], normal[2]);
    buf.colors.push(color.r, color.g, color.b);
  }
}

function cellBounds(grid: TerrainGrid, x: number, z: number) {
  const x0 = -(grid.width * grid.cellSize) / 2 + x * grid.cellSize;
  const z0 = -(grid.depth * grid.cellSize) / 2 + z * grid.cellSize;
  return { x0, x1: x0 + grid.cellSize, z0, z1: z0 + grid.cellSize };
}

function heightAt(grid: TerrainGrid, x: number, z: number): number {
  if (x < 0 || z < 0 || x >= grid.width || z >= grid.depth) return 0;
  return grid.heights[z * grid.width + x];
}

export function buildTerrainGeometry(data: TerrainData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const grid = decodeTerrainGrid(data);
  if (!grid) return geometry;

  const buf: MeshBuffers = { positions: [], normals: [], colors: [], quads: 0 };
  const top = new THREE.Color();
  const side = new THREE.Color();
  const bottom = new THREE.Color();

  for (let z = 0; z < grid.depth; z++) {
    for (let x = 0; x < grid.width; x++) {
      const h = heightAt(grid, x, z);
      if (h === 0) continue;
      const y = h * grid.voxelHeight;
      const { x0, x1, z0, z1 } = cellBounds(grid, x, z);

      top.set(TERRAIN_MATERIAL_COLORS[terrainMaterialAt(grid, x, z)]);
      side.copy(top).multiplyScalar(0.72);
      bottom.copy(top).multiplyScalar(0.48);

      pushQuad(buf, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], top);
      pushQuad(buf, [x0, 0, z1], [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [0, -1, 0], bottom);

      const east = heightAt(grid, x + 1, z) * grid.voxelHeight;
      if (east < y) {
        pushQuad(buf, [x1, east, z0], [x1, y, z0], [x1, y, z1], [x1, east, z1], [1, 0, 0], side);
      }
      const west = heightAt(grid, x - 1, z) * grid.voxelHeight;
      if (west < y) {
        pushQuad(buf, [x0, west, z1], [x0, y, z1], [x0, y, z0], [x0, west, z0], [-1, 0, 0], side);
      }
      const south = heightAt(grid, x, z + 1) * grid.voxelHeight;
      if (south < y) {
        pushQuad(buf, [x1, south, z1], [x1, y, z1], [x0, y, z1], [x0, south, z1], [0, 0, 1], side);
      }
      const north = heightAt(grid, x, z - 1) * grid.voxelHeight;
      if (north < y) {
        pushQuad(buf, [x0, north, z0], [x0, y, z0], [x1, y, z0], [x1, north, z0], [0, 0, -1], side);
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geometry.computeBoundingSphere();
  geometry.userData = { quadCount: buf.quads, terrain: true };
  return geometry;
}

export function createTerrainMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true
  });
}
