// Navigation: grid bookkeeping, A* correctness (detours, corners, costs) and
// the smoothing pass that turns a cell staircase into waypoints.

import { describe, it, expect } from 'vitest';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { findPath, pathCost } from '../src/engine/navigation/astar';
import { buildNavGrid } from '../src/engine/navigation/navGridFromScene';
import type { StudioObject } from '../src/engine/studio/types';
import {
  lineOfSight,
  simplifyCollinear,
  smoothPath,
  smoothWorldPath,
  toWorldPath
} from '../src/engine/navigation/pathSmoothing';

function gridFrom(rows: string[]): NavGrid {
  const height = rows.length;
  const width = rows[0].length;
  return NavGrid.fromPredicate(width, height, 1, (x, y) => rows[y][x] !== '#');
}

describe('NavGrid', () => {
  it('rejects degenerate dimensions', () => {
    expect(() => new NavGrid({ width: 0, height: 4, cellSize: 1 })).toThrow(/width/);
    expect(() => new NavGrid({ width: 4, height: 0, cellSize: 1 })).toThrow(/height/);
    expect(() => new NavGrid({ width: 4, height: 4, cellSize: 0 })).toThrow(/cellSize/);
  });

  it('tracks walkability inside bounds only', () => {
    const grid = gridFrom(['..', '.#']);
    expect(grid.isWalkable(0, 0)).toBe(true);
    expect(grid.isWalkable(1, 1)).toBe(false);
    expect(grid.isWalkable(-1, 0)).toBe(false);
    expect(grid.isWalkable(2, 0)).toBe(false);
  });

  it('round-trips world and cell coordinates', () => {
    const grid = new NavGrid({ width: 4, height: 4, cellSize: 2, origin: { x: -4, z: 10 } });
    const cell = grid.worldToCell(-3, 11)!;
    expect(cell).toEqual({ x: 0, y: 0 });
    expect(grid.cellToWorld(0, 0)).toEqual({ x: -3, z: 11 });
  });

  it('returns null for world points outside the grid', () => {
    const grid = new NavGrid({ width: 2, height: 2, cellSize: 1 });
    expect(grid.worldToCell(-1, 0)).toBeNull();
    expect(grid.worldToCell(5, 0)).toBeNull();
  });

  it('copies a mismatched blocked buffer instead of throwing', () => {
    const grid = new NavGrid({ width: 2, height: 2, cellSize: 1, blocked: new Uint8Array([1]) });
    expect(grid.isWalkable(0, 0)).toBe(false);
    expect(grid.isWalkable(1, 0)).toBe(true);
  });
});

describe('findPath', () => {
  it('walks a straight line', () => {
    const grid = gridFrom(['......']);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 5, y: 0 })!;
    expect(path).toHaveLength(6);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[5]).toEqual({ x: 5, y: 0 });
    expect(pathCost(path)).toBeCloseTo(5, 6);
  });

  it('returns the start alone when start equals goal', () => {
    const grid = gridFrom(['...']);
    expect(findPath(grid, { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([{ x: 1, y: 0 }]);
  });

  it('moves diagonally when allowed, at sqrt2 per step', () => {
    const grid = gridFrom(['....', '....', '....', '....']);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 3, y: 3 })!;
    expect(path).toHaveLength(4);
    expect(pathCost(path)).toBeCloseTo(3 * Math.SQRT2, 6);
  });

  it('takes the Manhattan route when diagonals are disabled', () => {
    const grid = gridFrom(['....', '....']);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 1 }, { allowDiagonal: false })!;
    expect(pathCost(path)).toBeCloseTo(3, 6);
  });

  it('detours around a wall through the gap', () => {
    const grid = gridFrom([
      '.....',
      '.###.',
      '.....'
    ]);
    const path = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(path).not.toBeNull();
    // Every step stays on walkable ground.
    for (const point of path) expect(grid.isWalkable(point.x, point.y)).toBe(true);
    // It must pass above or below the wall, never through it.
    expect(path.some((point) => point.y !== 1)).toBe(true);
  });

  it('returns null when the goal is walled off', () => {
    const grid = gridFrom([
      '..#',
      '..#',
      '..#'
    ]);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it('refuses a blocked start or goal', () => {
    const grid = gridFrom(['.#.', '...']);
    expect(findPath(grid, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeNull();
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('never cuts a corner between two blocked cells', () => {
    const grid = gridFrom(['.#', '#.']);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 }, { preventCornerCutting: false }))
      .toHaveLength(2);
  });

  it('gives up when the iteration budget runs out', () => {
    const rows = Array.from({ length: 20 }, () => '....................');
    const grid = gridFrom(rows);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 19, y: 19 }, { maxIterations: 2 })).toBeNull();
  });

  it('finds a path across a large open grid', () => {
    const rows = Array.from({ length: 40 }, () => '.'.repeat(40));
    const grid = gridFrom(rows);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 39, y: 39 })!;
    expect(path).toHaveLength(40);
    expect(pathCost(path)).toBeCloseTo(39 * Math.SQRT2, 4);
  });
});

describe('lineOfSight', () => {
  it('is clear across open ground', () => {
    const grid = gridFrom(['.....']);
    expect(lineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('is blocked by a wall', () => {
    const grid = gridFrom(['..#..']);
    expect(lineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });

  it('refuses to squeeze between two diagonal blocks', () => {
    const grid = gridFrom(['.#', '#.']);
    expect(lineOfSight(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });
});

describe('smoothing', () => {
  it('collapses an open-grid diagonal to two waypoints', () => {
    const grid = gridFrom(Array.from({ length: 6 }, () => '......'));
    const path = findPath(grid, { x: 0, y: 0 }, { x: 5, y: 4 })!;
    const smoothed = smoothPath(grid, path);
    expect(smoothed).toHaveLength(2);
    expect(smoothed[0]).toEqual({ x: 0, y: 0 });
    expect(smoothed[1]).toEqual({ x: 5, y: 4 });
  });

  it('keeps a corner when the direct line is blocked', () => {
    const grid = gridFrom([
      '.....',
      '###..',
      '.....'
    ]);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 0, y: 2 })!;
    const smoothed = smoothPath(grid, path);
    expect(smoothed.length).toBeGreaterThanOrEqual(2);
    expect(smoothed[0]).toEqual(path[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(path[path.length - 1]);
    expect(smoothed.length).toBeLessThanOrEqual(path.length);
  });

  it('never removes the endpoints', () => {
    const grid = gridFrom(['..#..', '..#..', '.....']);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    const smoothed = smoothPath(grid, path);
    expect(smoothed[0]).toEqual({ x: 0, y: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('drops collinear midpoints', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
    expect(simplifyCollinear(path)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  });

  it('maps the result into world metres', () => {
    const grid = new NavGrid({ width: 4, height: 4, cellSize: 2 });
    const world = toWorldPath(grid, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(world).toEqual([{ x: 1, z: 1 }, { x: 3, z: 3 }]);
  });

  it('returns an empty world path for a failed search', () => {
    const grid = gridFrom(['..']);
    expect(smoothWorldPath(grid, null)).toEqual([]);
  });
});

function box(type: string, x: number, z: number, sx = 2, sz = 2, canCollide = true): StudioObject {
  return {
    id: `${type}-${x}-${z}`,
    name: type,
    type,
    position: { x, y: 0, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: sx, y: 2, z: sz },
    color: '#ffffff',
    anchored: true,
    canCollide
  } as StudioObject;
}

describe('buildNavGrid', () => {
  it('blocks the cells under a colliding object', () => {
    const grid = buildNavGrid([box('block', 0, 0, 2, 2)], { cellSize: 1, agentRadius: 0 });
    const centre = grid.worldToCell(0, 0)!;
    expect(grid.isWalkable(centre.x, centre.y)).toBe(false);
    // Just past the 2x2 footprint, still inside the padded bounds.
    const outside = grid.worldToCell(1.5, 1.5)!;
    expect(grid.isWalkable(outside.x, outside.y)).toBe(true);
  });

  it('ignores pickups, spawns and non-colliding objects', () => {
    const grid = buildNavGrid(
      [box('coin', 0, 0), box('spawn', 4, 0), box('block', 8, 0, 2, 2, false)],
      { cellSize: 1, agentRadius: 0 }
    );
    for (const [x, z] of [[0, 0], [4, 0], [8, 0]]) {
      const cell = grid.worldToCell(x, z)!;
      expect(grid.isWalkable(cell.x, cell.y)).toBe(true);
    }
  });

  it('dilates obstacles by the agent radius', () => {
    const object = [box('block', 0, 0, 2, 2)];
    const tight = buildNavGrid(object, { cellSize: 1, agentRadius: 0 });
    const padded = buildNavGrid(object, { cellSize: 1, agentRadius: 1.5 });

    const countBlocked = (grid: typeof tight) => {
      let total = 0;
      for (let y = 0; y < grid.height; y += 1) {
        for (let x = 0; x < grid.width; x += 1) if (!grid.isWalkable(x, y)) total += 1;
      }
      return total;
    };

    expect(countBlocked(padded)).toBeGreaterThan(countBlocked(tight));
  });

  it('pads the bounds so edge cells exist', () => {
    const grid = buildNavGrid([box('block', 10, 10, 2, 2)], { cellSize: 1, agentRadius: 0 });
    expect(grid.originX).toBeLessThan(9);
    expect(grid.originZ).toBeLessThan(9);
    expect(grid.width).toBeGreaterThan(2);
    expect(grid.height).toBeGreaterThan(2);
  });

  it('produces a usable grid for an empty scene', () => {
    const grid = buildNavGrid([], { cellSize: 2 });
    expect(grid.width).toBe(1);
    expect(grid.height).toBe(1);
    expect(grid.isWalkable(0, 0)).toBe(true);
  });

  it('routes a path through the gap in a wall', () => {
    const objects = [box('block', -4, 0, 6, 2), box('block', 4, 0, 6, 2)];
    const bounds = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    const grid = buildNavGrid(objects, { cellSize: 1, agentRadius: 0.2, bounds });

    const start = grid.worldToCell(-8, -8)!;
    const goal = grid.worldToCell(8, 8)!;
    const path = findPath(grid, start, goal);

    expect(path).not.toBeNull();
    for (const point of path!) expect(grid.isWalkable(point.x, point.y)).toBe(true);
    // The only opening is around x = 0, so the route has to pass through it.
    const crossesGap = path!.some((point) => Math.abs(grid.cellToWorld(point.x, point.y).x) < 2);
    expect(crossesGap).toBe(true);
  });
});
