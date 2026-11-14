// The navmesh decomposition runs in the Rust kernel; this keeps it honest against
// the TypeScript reference, coordinate for coordinate.
//
// A decomposition that is merely "close" is not good enough: a rectangle in the
// wrong place puts a portal inside an obstacle, and the funnel would then emit a
// path that clips a wall. Exact equality is the only assertion worth making.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics, isWasmPhysicsReady } from '../src/engine/physics/wasmPhysics';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { decomposeWalkable, type NavRect } from '../src/engine/navigation/navMesh';
import { decomposeNavMeshWasm } from '../src/engine/navigation/wasmDecompose';

function reference(nav: NavGrid): NavRect[] {
  return decomposeWalkable(nav.width, nav.height, (x, y) => nav.isWalkable(x, y));
}

function gridFrom(width: number, height: number, blocked: Array<[number, number]>): NavGrid {
  const walls = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return NavGrid.fromPredicate(width, height, 1, (x, y) => !walls.has(`${x},${y}`), { x: 0, z: 0 });
}

/** Deterministic pseudo-random obstacles, so a failure is reproducible. */
function scatter(width: number, height: number, count: number, seed: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  let state = seed;
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const x = state % width;
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const y = state % height;
    cells.push([x, y]);
  }
  return cells;
}

describe('navmesh decomposition in the kernel', () => {
  beforeAll(async () => {
    await initWasmPhysics();
  });

  it('loads the kernel', () => {
    expect(isWasmPhysicsReady()).toBe(true);
  });

  it('matches the reference on an open field', () => {
    const nav = gridFrom(12, 9, []);
    expect(decomposeNavMeshWasm(nav)).toEqual(reference(nav));
  });

  it('matches the reference around a wall with a gap', () => {
    const walls: Array<[number, number]> = [];
    for (let y = 0; y <= 6; y += 1) walls.push([5, y]);
    const nav = gridFrom(12, 10, walls);
    expect(decomposeNavMeshWasm(nav)).toEqual(reference(nav));
  });

  it('matches the reference on scattered obstacles', () => {
    for (const seed of [7, 21, 99, 1234]) {
      const nav = gridFrom(24, 18, scatter(24, 18, 40, seed));
      expect(decomposeNavMeshWasm(nav), `seed ${seed}`).toEqual(reference(nav));
    }
  });

  it('matches the reference when every cell is blocked', () => {
    const nav = gridFrom(5, 5, []);
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) nav.setBlocked(x, y, true);
    expect(decomposeNavMeshWasm(nav)).toEqual([]);
    expect(reference(nav)).toEqual([]);
  });

  it('tiles the walkable cells exactly, whatever the obstacle layout', () => {
    const nav = gridFrom(20, 16, scatter(20, 16, 55, 4242));
    const rects = decomposeNavMeshWasm(nav)!;
    const covered = new Uint8Array(nav.cellCount);
    let count = 0;
    for (const rect of rects) {
      for (let y = rect.y0; y <= rect.y1; y += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) {
          const index = y * nav.width + x;
          expect(covered[index], `cell ${x},${y} covered twice`).toBe(0);
          covered[index] = 1;
          count += 1;
        }
      }
    }
    let walkable = 0;
    for (let y = 0; y < nav.height; y += 1) {
      for (let x = 0; x < nav.width; x += 1) if (nav.isWalkable(x, y)) walkable += 1;
    }
    expect(count).toBe(walkable);
  });
});
