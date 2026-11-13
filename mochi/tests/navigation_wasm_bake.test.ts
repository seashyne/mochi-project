// The nav bake runs in the Rust kernel; these tests keep it honest against the
// TypeScript reference and cover the region labels the kernel adds.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics, isWasmPhysicsReady } from '../src/engine/physics/wasmPhysics';
import { buildNavGrid } from '../src/engine/navigation/navGridFromScene';
import { findPath } from '../src/engine/navigation/astar';
import type { StudioObject } from '../src/engine/studio/types';

const BOUNDS = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
const OPTIONS = { cellSize: 1, agentRadius: 0.4, bounds: BOUNDS };

function part(
  id: string,
  type: StudioObject['type'],
  x: number,
  z: number,
  scaleX: number,
  scaleZ: number,
  extra: Partial<StudioObject> = {}
): StudioObject {
  return {
    id,
    name: id,
    type,
    position: { x, y: 1, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: scaleX, y: 2, z: scaleZ },
    color: '#6366f1',
    ...extra
  };
}

/** A wall down the middle that reaches both bounds, so it splits the map in two. */
const SPLIT_SCENE: StudioObject[] = [
  part('wall', 'block', 0, 0, 1, 20),
  part('rock', 'block', -6, 4, 2, 2),
  part('pad', 'jump_pad', 6, -6, 2, 2),
  part('ghost', 'block', 5, 5, 2, 2, { canCollide: false })
];

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
  expect(isWasmPhysicsReady()).toBe(true);
});

describe('kernel nav bake', () => {
  it('agrees with the TypeScript rasteriser cell for cell', () => {
    const fromKernel = buildNavGrid(SPLIT_SCENE, OPTIONS);
    const fromTypeScript = buildNavGrid(SPLIT_SCENE, { ...OPTIONS, useKernel: false });

    expect(fromKernel.regions).not.toBeNull();
    expect(fromTypeScript.regions).toBeNull();
    expect(fromKernel.width).toBe(fromTypeScript.width);
    expect(fromKernel.height).toBe(fromTypeScript.height);
    expect(fromKernel.originX).toBe(fromTypeScript.originX);
    expect(fromKernel.originZ).toBe(fromTypeScript.originZ);

    const mismatches: string[] = [];
    for (let y = 0; y < fromKernel.height; y += 1) {
      for (let x = 0; x < fromKernel.width; x += 1) {
        if (fromKernel.isWalkable(x, y) !== fromTypeScript.isWalkable(x, y)) {
          mismatches.push(`(${x}, ${y})`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('is deterministic across bakes', () => {
    const first = buildNavGrid(SPLIT_SCENE, OPTIONS);
    const second = buildNavGrid(SPLIT_SCENE, OPTIONS);
    expect(second.regionCount).toBe(first.regionCount);
    expect(Array.from(second.regions ?? [])).toEqual(Array.from(first.regions ?? []));
  });

  it('labels the two halves of a split map separately', () => {
    const grid = buildNavGrid(SPLIT_SCENE, OPTIONS);
    const left = grid.worldToCell(-8, 0);
    const right = grid.worldToCell(8, 0);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();

    const leftRegion = grid.regionAt(left!.x, left!.y);
    const rightRegion = grid.regionAt(right!.x, right!.y);
    expect(leftRegion).toBeGreaterThan(0);
    expect(rightRegion).toBeGreaterThan(0);
    expect(leftRegion).not.toBe(rightRegion);
    expect(grid.regionCount).toBe(2);
  });

  it('leaves blocked cells unlabelled', () => {
    const grid = buildNavGrid(SPLIT_SCENE, OPTIONS);
    const wall = grid.worldToCell(0, 0);
    expect(wall).not.toBeNull();
    expect(grid.regionAt(wall!.x, wall!.y)).toBe(0);
  });

  it('refuses a route across regions and still routes inside one', () => {
    const grid = buildNavGrid(SPLIT_SCENE, OPTIONS);
    const left = grid.worldToCell(-8, -8)!;
    const right = grid.worldToCell(8, 8)!;

    expect(findPath(grid, left, right)).toBeNull();

    const otherLeft = grid.worldToCell(-8, 6)!;
    expect(findPath(grid, left, otherLeft)).not.toBeNull();
  });

  it('treats a diagonal-only touch as two regions', () => {
    // Two single-cell blocks leave (0,0) and (1,1) walkable but touching only at a
    // corner. The pathfinder refuses corner cutting, so they are not connected.
    const scene = [
      part('a', 'block', 1.5, 0.5, 1, 1),
      part('b', 'block', 0.5, 1.5, 1, 1)
    ];
    const grid = buildNavGrid(scene, {
      cellSize: 1,
      agentRadius: 0,
      bounds: { minX: 0, minZ: 0, maxX: 3, maxZ: 3 }
    });

    const corner = grid.worldToCell(0.5, 0.5)!;
    const inner = grid.worldToCell(1.5, 1.5)!;
    expect(grid.isWalkable(corner.x, corner.y)).toBe(true);
    expect(grid.isWalkable(inner.x, inner.y)).toBe(true);
    expect(grid.regionAt(corner.x, corner.y)).not.toBe(grid.regionAt(inner.x, inner.y));
  });
});

describe('region labelling', () => {
  /** Reference partition: plain BFS over the grid the kernel produced. */
  function referencePartition(
    width: number,
    height: number,
    walkable: (x: number, y: number) => boolean
  ): string[] {
    const seen = new Uint8Array(width * height);
    const groups: string[] = [];
    for (let startY = 0; startY < height; startY += 1) {
      for (let startX = 0; startX < width; startX += 1) {
        const start = startY * width + startX;
        if (seen[start] || !walkable(startX, startY)) continue;
        const cells: string[] = [];
        const queue: Array<[number, number]> = [[startX, startY]];
        seen[start] = 1;
        while (queue.length) {
          const [x, y] = queue.pop()!;
          cells.push(`${x},${y}`);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const index = ny * width + nx;
            if (seen[index] || !walkable(nx, ny)) continue;
            seen[index] = 1;
            queue.push([nx, ny]);
          }
        }
        groups.push(cells.sort().join(' '));
      }
    }
    return groups.sort();
  }

  it('partitions a maze exactly like a plain flood fill', () => {
    // Two walls spanning the full depth cut the map into three strips, and an
    // island inside the middle strip adds a hole for the span scan to deal with.
    const scene: StudioObject[] = [
      part('wallA', 'block', -4, 0, 1, 24),
      part('wallB', 'block', 4, 0, 1, 24),
      part('island', 'block', 0, 0, 2, 2)
    ];

    const options = { cellSize: 1, agentRadius: 0, bounds: { minX: -12, minZ: -12, maxX: 12, maxZ: 12 } };
    const grid = buildNavGrid(scene, options);
    const reference = referencePartition(
      grid.width,
      grid.height,
      (x, y) => grid.isWalkable(x, y)
    );

    const kernelGroups = new Map<number, string[]>();
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const region = grid.regionAt(x, y);
        if (region === 0) continue;
        const bucket = kernelGroups.get(region) ?? [];
        bucket.push(`${x},${y}`);
        kernelGroups.set(region, bucket);
      }
    }
    const kernel = [...kernelGroups.values()].map((cells) => cells.sort().join(' ')).sort();

    // Guard against a vacuous pass: the comb must actually split the map.
    expect(reference.length).toBeGreaterThan(1);
    expect(kernel).toEqual(reference);
    expect(grid.regionCount).toBe(reference.length);
  });
});
