// Convex decomposition of the walkable area into a polygon navmesh.
//
// The grid bake answers "can an agent stand here"; this turns that bitmap into
// convex regions an agent can walk across in straight lines. Regions are
// rectangles, which is the convex shape a rectilinear world actually produces:
// every obstacle is a box, so every free face is axis-aligned. Recast would
// triangulate arbitrary surfaces; this runtime only ever has floors and boxes,
// so the simpler decomposition is exact rather than an approximation.
//
// Region edges snap to the bake's cell grid, so a portal sits within half a cell
// of the true obstacle face. That is the same tolerance the grid pathfinder had,
// and the funnel pass removes the staircase that tolerance used to cause.

import type { NavGrid } from './navGrid';

export interface NavRect {
  /** Inclusive cell coordinates, matching NavGrid. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NavPortal {
  /** Region indices on each side of the shared edge. */
  a: number;
  b: number;
  /** World-space endpoints of the shared edge. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface Edge {
  rect: number;
  start: number;
  end: number;
}

/**
 * Greedy maximal rectangles over the walkable cells.
 *
 * Each pass extends right while the row is free, then down while the whole span
 * stays free. The result tiles the walkable area exactly - no cell is covered
 * twice, none is missed - which is what lets the parity test compare the two
 * implementations coordinate for coordinate.
 */
export function decomposeWalkable(
  width: number,
  height: number,
  isWalkable: (x: number, y: number) => boolean
): NavRect[] {
  const visited = new Uint8Array(width * height);
  const rects: NavRect[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (visited[index] || !isWalkable(x, y)) continue;

      let x1 = x;
      while (x1 + 1 < width && !visited[y * width + x1 + 1] && isWalkable(x1 + 1, y)) x1 += 1;

      let y1 = y;
      while (y1 + 1 < height) {
        let rowFree = true;
        for (let probe = x; probe <= x1; probe += 1) {
          if (visited[(y1 + 1) * width + probe] || !isWalkable(probe, y1 + 1)) {
            rowFree = false;
            break;
          }
        }
        if (!rowFree) break;
        y1 += 1;
      }

      for (let row = y; row <= y1; row += 1) {
        visited.fill(1, row * width + x, row * width + x1 + 1);
      }
      rects.push({ x0: x, y0: y, x1, y1 });
    }
  }

  return rects;
}

/** Collects the border segments of one axis, keyed by the cell line they sit on. */
function indexEdges(
  rects: NavRect[],
  line: (rect: NavRect) => number,
  span: (rect: NavRect) => [number, number]
): Map<number, Edge[]> {
  const map = new Map<number, Edge[]>();
  rects.forEach((rect, index) => {
    const key = line(rect);
    const [start, end] = span(rect);
    const list = map.get(key);
    if (list) list.push({ rect: index, start, end });
    else map.set(key, [{ rect: index, start, end }]);
  });
  return map;
}

function connect(
  left: Map<number, Edge[]>,
  right: Map<number, Edge[]>,
  portals: NavPortal[],
  toWorld: (line: number, start: number, end: number) => Omit<NavPortal, 'a' | 'b'>
): void {
  for (const [line, edges] of left) {
    const opposite = right.get(line + 1);
    if (!opposite) continue;
    for (const edge of edges) {
      for (const other of opposite) {
        const start = Math.max(edge.start, other.start);
        const end = Math.min(edge.end, other.end);
        if (end < start) continue;
        const span = toWorld(line, start, end);
        portals.push({ a: edge.rect, b: other.rect, ...span });
      }
    }
  }
}

export interface NavLink {
  to: number;
  /** Index into `portals`. */
  portal: number;
}

export interface NavMesh {
  readonly rects: NavRect[];
  readonly portals: NavPortal[];
  /** Region index per cell, -1 for blocked cells. */
  readonly cellToRect: Int32Array;
  /** Region adjacency, both directions, built once at bake time. */
  readonly adjacency: NavLink[][];
  readonly width: number;
  readonly height: number;
}

/**
 * Builds the navmesh: decomposition, adjacency and a cell-to-region index.
 * `precomputed` lets the caller supply the kernel's decomposition; the TypeScript
 * scan is the fallback and the reference the parity test compares against.
 */
export function buildNavMesh(grid: NavGrid, precomputed?: NavRect[]): NavMesh {
  const { width, height, cellSize, originX, originZ } = grid;
  const rects = precomputed ?? decomposeWalkable(width, height, (x, y) => grid.isWalkable(x, y));

  const cellToRect = new Int32Array(width * height).fill(-1);
  rects.forEach((rect, index) => {
    for (let y = rect.y0; y <= rect.y1; y += 1) {
      cellToRect.fill(index, y * width + rect.x0, y * width + rect.x1 + 1);
    }
  });

  // A rect's right edge sits on column x1; its neighbour's left edge is x1 + 1.
  const rightEdges = indexEdges(rects, (rect) => rect.x1, (rect) => [rect.y0, rect.y1]);
  const leftEdges = indexEdges(rects, (rect) => rect.x0, (rect) => [rect.y0, rect.y1]);
  const bottomEdges = indexEdges(rects, (rect) => rect.y1, (rect) => [rect.x0, rect.x1]);
  const topEdges = indexEdges(rects, (rect) => rect.y0, (rect) => [rect.x0, rect.x1]);

  const portals: NavPortal[] = [];

  connect(rightEdges, leftEdges, portals, (line, start, end) => {
    const x = originX + (line + 1) * cellSize;
    return { ax: x, az: originZ + start * cellSize, bx: x, bz: originZ + (end + 1) * cellSize };
  });

  connect(bottomEdges, topEdges, portals, (line, start, end) => {
    const z = originZ + (line + 1) * cellSize;
    return { ax: originX + start * cellSize, az: z, bx: originX + (end + 1) * cellSize, bz: z };
  });

  const adjacency: NavLink[][] = rects.map(() => []);
  portals.forEach((portal, index) => {
    adjacency[portal.a].push({ to: portal.b, portal: index });
    adjacency[portal.b].push({ to: portal.a, portal: index });
  });

  return { rects, portals, cellToRect, adjacency, width, height };
}

/** Region containing a cell, or -1. */
export function rectAtCell(mesh: NavMesh, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= mesh.width || y >= mesh.height) return -1;
  return mesh.cellToRect[y * mesh.width + x];
}

/** Centre of a region in cell coordinates, used as the A* cost anchor. */
export function rectCentre(rect: NavRect): { x: number; y: number } {
  return { x: (rect.x0 + rect.x1 + 1) / 2, y: (rect.y0 + rect.y1 + 1) / 2 };
}
