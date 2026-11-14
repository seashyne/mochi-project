// Navmesh decomposition and funnel path: the convex-region pathfinder.
//
// The decomposition is checked structurally (it must tile the walkable cells
// exactly), and the path is checked by walking its segments and asking the grid
// whether the ground underneath is walkable. That second check is the one that
// matters: a taut path that clips a corner is worse than a staircase.

import { describe, it, expect } from 'vitest';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { buildNavMesh, decomposeWalkable, rectAtCell } from '../src/engine/navigation/navMesh';
import { findNavMeshPath, navMeshFor } from '../src/engine/navigation/navMeshPath';

function grid(width: number, height: number, blocked: Array<[number, number]> = []): NavGrid {
  const walls = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return NavGrid.fromPredicate(width, height, 1, (x, y) => !walls.has(`${x},${y}`), { x: 0, z: 0 });
}

/** True when the open interval of the segment stays over walkable cells. */
function segmentIsClear(nav: NavGrid, from: { x: number; z: number }, to: { x: number; z: number }): boolean {
  const steps = Math.max(8, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) * 12));
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    const cell = nav.worldToCell(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t);
    if (!cell || !nav.isWalkable(cell.x, cell.y)) return false;
  }
  return true;
}

function pathIsClear(nav: NavGrid, path: Array<{ x: number; z: number }>): boolean {
  for (let index = 1; index < path.length; index += 1) {
    if (!segmentIsClear(nav, path[index - 1], path[index])) return false;
  }
  return true;
}

describe('convex decomposition', () => {
  it('collapses an open field into a single region', () => {
    const rects = decomposeWalkable(10, 8, () => true);
    expect(rects).toEqual([{ x0: 0, y0: 0, x1: 9, y1: 7 }]);
  });

  it('returns nothing when every cell is blocked', () => {
    expect(decomposeWalkable(4, 4, () => false)).toEqual([]);
  });

  it('splits on a wall that runs the full height', () => {
    const rects = decomposeWalkable(10, 4, (x) => x !== 5);
    expect(rects).toHaveLength(2);
    expect(rects.map((rect) => [rect.x0, rect.x1])).toEqual([[0, 4], [6, 9]]);
  });

  it('tiles the walkable cells exactly, with no overlap and no gap', () => {
    const width = 12;
    const height = 9;
    const walls = new Set(['3,2', '3,3', '4,3', '7,6', '8,6', '8,5']);
    const walkable = (x: number, y: number) => !walls.has(`${x},${y}`);
    const rects = decomposeWalkable(width, height, walkable);

    const coverage = new Uint8Array(width * height);
    let covered = 0;
    for (const rect of rects) {
      for (let y = rect.y0; y <= rect.y1; y += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) {
          const index = y * width + x;
          expect(coverage[index], `cell ${x},${y} covered twice`).toBe(0);
          coverage[index] = 1;
          covered += 1;
        }
      }
    }

    let expected = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if (walkable(x, y)) expected += 1;
    }
    expect(covered).toBe(expected);
  });
});

describe('mesh adjacency', () => {
  it('links two regions that share an edge and reports the portal span', () => {
    // L-shaped free space: the arm along the top and the leg down the left.
    const nav = NavGrid.fromPredicate(6, 6, 1, (x, y) => x <= 2 || y <= 2, { x: 0, z: 0 });
    const mesh = buildNavMesh(nav);
    expect(mesh.rects).toHaveLength(2);
    expect(mesh.portals).toHaveLength(1);

    const portal = mesh.portals[0];
    expect(portal.a).not.toBe(portal.b);
    // The shared edge is the horizontal line at z = 3, spanning x = 0..3.
    expect(portal.az).toBeCloseTo(3, 6);
    expect(portal.bz).toBeCloseTo(3, 6);
    const span = [portal.ax, portal.bx].sort((a, b) => a - b);
    expect(span).toEqual([0, 3]);
  });

  it('does not link regions that only touch at a corner', () => {
    // Two free cells on a diagonal: they meet at a point, not an edge, and the
    // 4-way rule says a diagonal-only link is not a link.
    const nav = grid(2, 2, [
      [1, 0],
      [0, 1]
    ]);
    const mesh = buildNavMesh(nav);
    expect(mesh.rects).toHaveLength(2);
    expect(mesh.portals).toHaveLength(0);
  });

  it('indexes every walkable cell to its region', () => {
    const nav = grid(6, 6, [
      [2, 2],
      [2, 3]
    ]);
    const mesh = navMeshFor(nav);
    expect(rectAtCell(mesh, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(rectAtCell(mesh, 2, 2)).toBe(-1);
    expect(rectAtCell(mesh, 99, 99)).toBe(-1);
  });
});

describe('taut pathfinding', () => {
  it('walks straight across an open field', () => {
    const nav = grid(12, 12);
    const path = findNavMeshPath(nav, { x: 1.5, z: 1.5 }, { x: 10.5, z: 10.5 });
    expect(path).toHaveLength(2);
    expect(path![0]).toEqual({ x: 1.5, z: 1.5 });
    expect(path![1]).toEqual({ x: 10.5, z: 10.5 });
  });

  it('goes around a wall through the gap it leaves', () => {
    const walls: Array<[number, number]> = [];
    for (let y = 0; y <= 6; y += 1) walls.push([5, y]);
    const nav = grid(12, 10, walls);

    const path = findNavMeshPath(nav, { x: 2.5, z: 2.5 }, { x: 9.5, z: 2.5 });
    expect(path).not.toBeNull();
    expect(pathIsClear(nav, path!)).toBe(true);
    // The detour has to dip below the wall's last blocked cell.
    expect(Math.max(...path!.map((point) => point.z))).toBeGreaterThan(6.5);
  });

  it('turns the corner of an L-shaped corridor instead of staircasing', () => {
    const walls: Array<[number, number]> = [];
    for (let x = 4; x < 12; x += 1) walls.push([x, 4]);
    for (let y = 4; y < 12; y += 1) walls.push([4, y]);
    const nav = grid(12, 12, walls);

    const path = findNavMeshPath(nav, { x: 1.5, z: 1.5 }, { x: 2.5, z: 9.5 });
    expect(path).not.toBeNull();
    expect(pathIsClear(nav, path!)).toBe(true);
    // A staircase would carry a dozen points; the funnel keeps the corner only.
    expect(path!.length).toBeLessThanOrEqual(4);
  });

  it('returns null when the goal is walled off', () => {
    const walls: Array<[number, number]> = [];
    for (let y = 0; y < 8; y += 1) walls.push([4, y]);
    const nav = grid(8, 8, walls);
    expect(findNavMeshPath(nav, { x: 1.5, z: 1.5 }, { x: 6.5, z: 6.5 })).toBeNull();
  });

  it('refuses a start or goal that is not walkable', () => {
    const nav = grid(6, 6, [[1, 1]]);
    expect(findNavMeshPath(nav, { x: 1.5, z: 1.5 }, { x: 4.5, z: 4.5 })).toBeNull();
    expect(findNavMeshPath(nav, { x: 4.5, z: 4.5 }, { x: 1.5, z: 1.5 })).toBeNull();
  });

  it('keeps a two-point path when both ends share a region', () => {
    const nav = grid(8, 8);
    const path = findNavMeshPath(nav, { x: 2.2, z: 3.3 }, { x: 5.6, z: 1.4 });
    expect(path).toEqual([
      { x: 2.2, z: 3.3 },
      { x: 5.6, z: 1.4 }
    ]);
  });
});
