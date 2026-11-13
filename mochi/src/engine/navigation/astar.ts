// A* over the walkability grid.
//
// Eight-way movement with an octile heuristic, a binary heap for the open set
// and typed arrays for the per-cell bookkeeping. Diagonal moves are refused when
// either orthogonal neighbour is blocked, so an agent never clips a corner.

import { NavGrid, type NavPoint } from './navGrid';

export interface PathOptions {
  /** Defaults to true. Orthogonal-only when false. */
  allowDiagonal?: boolean;
  /** Refuse a diagonal step when either orthogonal cell is blocked. Default true. */
  preventCornerCutting?: boolean;
  /** Safety valve for pathological grids. Defaults to 4x the cell count. */
  maxIterations?: number;
}

const SQRT2 = Math.SQRT2;

// Octile distance: exact cost of an unobstructed 8-way walk.
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

// Min-heap of cell indices ordered by an external score array. Re-pushing a node
// with a better score is cheaper than supporting decrease-key.
class NodeHeap {
  private readonly items: number[] = [];

  constructor(private readonly score: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  push(node: number): void {
    this.items.push(node);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.score[this.items[parent]] <= this.score[this.items[child]]) break;
      [this.items[parent], this.items[child]] = [this.items[child], this.items[parent]];
      child = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.items.length && this.score[this.items[left]] < this.score[this.items[smallest]]) {
          smallest = left;
        }
        if (right < this.items.length && this.score[this.items[right]] < this.score[this.items[smallest]]) {
          smallest = right;
        }
        if (smallest === parent) break;
        [this.items[parent], this.items[smallest]] = [this.items[smallest], this.items[parent]];
        parent = smallest;
      }
    }
    return top;
  }
}

interface Step {
  dx: number;
  dy: number;
  cost: number;
}

const DIAGONAL_STEPS: Step[] = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: SQRT2 },
  { dx: 1, dy: -1, cost: SQRT2 },
  { dx: -1, dy: 1, cost: SQRT2 },
  { dx: -1, dy: -1, cost: SQRT2 }
];

const ORTHOGONAL_STEPS: Step[] = DIAGONAL_STEPS.slice(0, 4);

function reconstruct(grid: NavGrid, cameFrom: Int32Array, goalIndex: number): NavPoint[] {
  const path: NavPoint[] = [];
  let node = goalIndex;
  while (node !== -1) {
    const x = node % grid.width;
    path.push({ x, y: (node - x) / grid.width });
    node = cameFrom[node];
  }
  return path.reverse();
}

/**
 * Returns the cell path from start to goal, both included, or null when the goal
 * is unreachable. Blocked endpoints return null rather than a partial path.
 */
export function findPath(
  grid: NavGrid,
  start: NavPoint,
  goal: NavPoint,
  options: PathOptions = {}
): NavPoint[] | null {
  if (!grid.isWalkable(start.x, start.y) || !grid.isWalkable(goal.x, goal.y)) return null;

  const startIndex = grid.index(start.x, start.y);
  const goalIndex = grid.index(goal.x, goal.y);
  if (startIndex === goalIndex) return [{ x: start.x, y: start.y }];

  const total = grid.cellCount;
  const gScore = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const fScore = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  gScore[startIndex] = 0;
  fScore[startIndex] = octile(start.x, start.y, goal.x, goal.y);

  const open = new NodeHeap(fScore);
  open.push(startIndex);

  const steps = options.allowDiagonal === false ? ORTHOGONAL_STEPS : DIAGONAL_STEPS;
  const preventCornerCutting = options.preventCornerCutting !== false;
  const maxIterations = options.maxIterations ?? total * 4;
  let iterations = 0;

  while (open.size > 0) {
    iterations += 1;
    if (iterations > maxIterations) return null;

    const current = open.pop();
    if (closed[current]) continue;
    if (current === goalIndex) return reconstruct(grid, cameFrom, goalIndex);
    closed[current] = 1;

    const cx = current % grid.width;
    const cy = (current - cx) / grid.width;

    for (const step of steps) {
      const nx = cx + step.dx;
      const ny = cy + step.dy;
      if (!grid.isWalkable(nx, ny)) continue;
      if (step.dx !== 0 && step.dy !== 0 && preventCornerCutting) {
        if (!grid.isWalkable(cx + step.dx, cy) || !grid.isWalkable(cx, cy + step.dy)) continue;
      }

      const neighbour = grid.index(nx, ny);
      if (closed[neighbour]) continue;

      const tentative = gScore[current] + step.cost;
      if (tentative >= gScore[neighbour]) continue;

      gScore[neighbour] = tentative;
      fScore[neighbour] = tentative + octile(nx, ny, goal.x, goal.y);
      cameFrom[neighbour] = current;
      open.push(neighbour);
    }
  }

  return null;
}

/** Total cost of a cell path, in cells (1 per orthogonal step, sqrt2 diagonal). */
export function pathCost(path: NavPoint[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const dx = Math.abs(path[index].x - path[index - 1].x);
    const dy = Math.abs(path[index].y - path[index - 1].y);
    total += dx !== 0 && dy !== 0 ? SQRT2 : 1;
  }
  return total;
}
