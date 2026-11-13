// The benchmark world: a fixed 6x6 grid of rooms, one chunk each.
//
// It is deliberately shaped so that some rooms are behind walls and some are not:
// a benchmark scene that only exercises the best case tells you nothing about the
// cost when culling cannot help.

import * as THREE from 'three';
import { attachChunkRef, type MochiManifestV2 } from '@/engine/package/manifestV2';
import type { StudioObject } from '@/engine/studio/types';

export const ROOMS = 6;
export const ROOM_SIZE = 24;
const WALL_HEIGHT = 6;
const DOOR_WIDTH = 4;
const PILLARS_PER_ROOM = 6;

export interface BenchmarkWorld {
  manifest: MochiManifestV2;
  objectCount: number;
}

/** Camera placements: one where cover exists, one where it cannot possibly. */
export const VIEWPOINTS = [
  {
    name: 'rooms',
    position: new THREE.Vector3(ROOM_SIZE / 2, 3, ROOM_SIZE / 2),
    target: new THREE.Vector3(ROOM_SIZE * 2, 2.4, ROOM_SIZE * 2)
  },
  {
    name: 'overview',
    position: new THREE.Vector3((ROOMS * ROOM_SIZE) / 2, 150, (ROOMS * ROOM_SIZE) / 2 + 40),
    target: new THREE.Vector3((ROOMS * ROOM_SIZE) / 2, 0, (ROOMS * ROOM_SIZE) / 2)
  }
];

function block(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number
): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: sx, y: sy, z: sz },
    color: '#5b6472'
  };
}

/** One room per chunk: a floor, two walls with a doorway, and a few pillars. */
function roomObjects(gx: number, gz: number): StudioObject[] {
  const objects: StudioObject[] = [];
  const x0 = gx * ROOM_SIZE;
  const z0 = gz * ROOM_SIZE;
  const prefix = `r${gx}_${gz}`;
  const segment = (ROOM_SIZE - DOOR_WIDTH) / 2;

  objects.push(block(`${prefix}_floor`, x0 + ROOM_SIZE / 2, 0, z0 + ROOM_SIZE / 2, ROOM_SIZE, 0.5, ROOM_SIZE));

  // Only the +X and +Z edges get walls; the neighbouring room supplies the others.
  for (const side of [0, 1]) {
    const offset = side === 0 ? segment / 2 : ROOM_SIZE - segment / 2;
    objects.push(block(`${prefix}_wx${side}`, x0 + offset, WALL_HEIGHT / 2, z0 + ROOM_SIZE, segment, WALL_HEIGHT, 1));
    objects.push(block(`${prefix}_wz${side}`, x0 + ROOM_SIZE, WALL_HEIGHT / 2, z0 + offset, 1, WALL_HEIGHT, segment));
  }

  for (let index = 0; index < PILLARS_PER_ROOM; index += 1) {
    const px = x0 + 4 + (index % 3) * 7;
    const pz = z0 + 5 + Math.floor(index / 3) * 9;
    objects.push(block(`${prefix}_p${index}`, px, WALL_HEIGHT / 2, pz, 1.2, WALL_HEIGHT, 1.2));
  }

  return objects;
}

export function buildManifest(): BenchmarkWorld {
  const chunks = [];
  let objectCount = 0;

  for (let gz = 0; gz < ROOMS; gz += 1) {
    for (let gx = 0; gx < ROOMS; gx += 1) {
      const objects = roomObjects(gx, gz);
      objectCount += objects.length;
      const payload = { chunkId: `c_${gx}_${gz}`, objects };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      chunks.push(
        attachChunkRef(payload, {
          url: URL.createObjectURL(blob),
          key: `benchmark/${gx}_${gz}`,
          hash: 'd'.repeat(64),
          sizeBytes: blob.size,
          contentType: 'application/json'
        })
      );
    }
  }

  return {
    manifest: {
      manifestVersion: '2.0',
      title: 'Render benchmark',
      version: '1.0.0',
      spawn: { x: ROOM_SIZE / 2, y: 2, z: ROOM_SIZE / 2 },
      chunking: { strategy: 'grid', cellSize: ROOM_SIZE, objectLimitPerChunk: 200 },
      chunks
    },
    objectCount
  };
}
