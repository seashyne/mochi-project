// Path post-processing: string pulling and collinear cleanup.
//
// A* returns every cell it stepped through, which makes an agent walk in a
// staircase. Smoothing keeps only the corners it actually has to turn at.

import { NavGrid, type NavPoint } from './navGrid';

// Samples per cell along the test segment. 4 keeps the check within a quarter
// cell of the true line, which is enough to catch a corner squeeze.
const SAMPLES_PER_CELL = 4;

/**
 * True when a straight walk between two cells stays on walkable ground.
 * Diagonal transitions are refused when both orthogonal cells are blocked, so
 * the smoothed path cannot cut a corner either.
 */
export function lineOfSight(grid: NavGrid, from: NavPoint, to: NavPoint): boolean {
  if (!grid.isWalkable(from.x, from.y) || !grid.isWalkable(to.x, to.y)) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const samples = Math.max(Math.abs(dx), Math.abs(dy)) * SAMPLES_PER_CELL;
  if (samples === 0) return true;

  let previousX = from.x;
  let previousY = from.y;

  for (let step = 1; step <= samples; step += 1) {
    const t = step / samples;
    const cellX = Math.round(from.x + dx * t);
    const cellY = Math.round(from.y + dy * t);
    if (!grid.isWalkable(cellX, cellY)) return false;

    if (cellX !== previousX && cellY !== previousY) {
      const sideA = grid.isWalkable(cellX, previousY);
      const sideB = grid.isWalkable(previousX, cellY);
      if (!sideA && !sideB) return false;
    }

    previousX = cellX;
    previousY = cellY;
  }

  return true;
}

/**
 * Greedy string pulling: from the current anchor, jump to the furthest cell that
 * is still in line of sight. Worst case is quadratic in path length, which is
 * fine for the path lengths a grid of this size produces.
 */
export function smoothPath(grid: NavGrid, path: NavPoint[]): NavPoint[] {
  if (path.length <= 2) return path.map((point) => ({ ...point }));

  const smoothed: NavPoint[] = [{ ...path[0] }];
  let anchor = 0;

  while (anchor < path.length - 1) {
    let target = anchor + 1;
    for (let probe = path.length - 1; probe > anchor + 1; probe -= 1) {
      if (lineOfSight(grid, path[anchor], path[probe])) {
        target = probe;
        break;
      }
    }
    smoothed.push({ ...path[target] });
    anchor = target;
  }

  return smoothed;
}

/** Drops points that continue in the same direction as their neighbours. */
export function simplifyCollinear(path: NavPoint[]): NavPoint[] {
  if (path.length <= 2) return path.map((point) => ({ ...point }));

  const simplified: NavPoint[] = [{ ...path[0] }];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    const sameDirection =
      Math.sign(current.x - previous.x) === Math.sign(next.x - current.x) &&
      Math.sign(current.y - previous.y) === Math.sign(next.y - current.y);
    if (!sameDirection) simplified.push({ ...current });
  }
  simplified.push({ ...path[path.length - 1] });
  return simplified;
}

/** Cell path to world-space waypoints at cell centres. */
export function toWorldPath(grid: NavGrid, path: NavPoint[]): Array<{ x: number; z: number }> {
  return path.map((point) => grid.cellToWorld(point.x, point.y));
}

/** Convenience: A* result with smoothing applied, in cell coordinates. */
export function smoothWorldPath(
  grid: NavGrid,
  path: NavPoint[] | null
): Array<{ x: number; z: number }> {
  if (!path || path.length === 0) return [];
  return toWorldPath(grid, simplifyCollinear(smoothPath(grid, path)));
}
