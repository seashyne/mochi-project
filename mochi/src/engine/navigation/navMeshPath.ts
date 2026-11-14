// Pathfinding over the convex navmesh: region A* followed by the funnel pass.
//
// A* over regions costs a handful of nodes instead of one node per cell, and the
// funnel turns the portal sequence into the taut path an agent should walk. The
// grid pathfinder is kept as the fallback for anything the mesh cannot answer.

import type { NavGrid } from './navGrid';
import { buildNavMesh, rectAtCell, rectCentre, type NavMesh, type NavPortal } from './navMesh';
import { decomposeNavMeshWasm } from './wasmDecompose';
import { findPath } from './astar';
import { smoothWorldPath } from './pathSmoothing';

export interface Waypoint {
  x: number;
  z: number;
}

const meshes = new WeakMap<NavGrid, NavMesh>();

/** The mesh is derived once per grid and cached; a re-bake produces a new grid. */
export function navMeshFor(grid: NavGrid): NavMesh {
  const cached = meshes.get(grid);
  if (cached) return cached;
  const rects = decomposeNavMeshWasm(grid) ?? undefined;
  const mesh = buildNavMesh(grid, rects);
  meshes.set(grid, mesh);
  return mesh;
}

function centreWorld(grid: NavGrid, mesh: NavMesh, rect: number): Waypoint {
  const centre = rectCentre(mesh.rects[rect]);
  return { x: grid.originX + centre.x * grid.cellSize, z: grid.originZ + centre.y * grid.cellSize };
}

function distance(a: Waypoint, b: Waypoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

interface Route {
  regions: number[];
  portals: number[];
}

/** A* over the region graph. Costs are region-centre distances, which is enough
 *  because the funnel removes the detour the centres imply. */
function searchRegions(
  grid: NavGrid,
  mesh: NavMesh,
  start: number,
  goal: number,
  goalPoint: Waypoint
): Route | null {
  const count = mesh.rects.length;
  const gScore = new Float64Array(count).fill(Infinity);
  const cameFrom = new Int32Array(count).fill(-1);
  const cameByPortal = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const open: number[] = [start];
  gScore[start] = 0;

  const heuristic = (rect: number): number => distance(centreWorld(grid, mesh, rect), goalPoint);

  while (open.length > 0) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let index = 0; index < open.length; index += 1) {
      const rect = open[index];
      const score = gScore[rect] + heuristic(rect);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const currentCentre = centreWorld(grid, mesh, current);
    for (const link of mesh.adjacency[current]) {
      if (closed[link.to]) continue;
      const tentative = gScore[current] + distance(currentCentre, centreWorld(grid, mesh, link.to));
      if (tentative >= gScore[link.to]) continue;
      gScore[link.to] = tentative;
      cameFrom[link.to] = current;
      cameByPortal[link.to] = link.portal;
      if (!open.includes(link.to)) open.push(link.to);
    }
  }

  if (start !== goal && cameFrom[goal] === -1) return null;

  const regions = [goal];
  const portals: number[] = [];
  let cursor = goal;
  while (cursor !== start) {
    const previous = cameFrom[cursor];
    if (previous === -1) return null;
    portals.push(cameByPortal[cursor]);
    regions.push(previous);
    cursor = previous;
  }
  regions.reverse();
  portals.reverse();
  return { regions, portals };
}

/** Orders a portal's endpoints as left/right for a traveller heading `dir`. */
function sides(portal: NavPortal, dirX: number, dirZ: number): { left: Waypoint; right: Waypoint } {
  // Rotating the travel direction by +90 degrees gives the left-hand normal.
  const leftX = -dirZ;
  const leftZ = dirX;
  const aScore = (portal.ax - portal.bx) * leftX + (portal.az - portal.bz) * leftZ;
  const a: Waypoint = { x: portal.ax, z: portal.az };
  const b: Waypoint = { x: portal.bx, z: portal.bz };
  return aScore > 0 ? { left: a, right: b } : { left: b, right: a };
}

function triArea2(a: Waypoint, b: Waypoint, c: Waypoint): number {
  return (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
}

/**
 * Simple stupid funnel: walk the portal sequence, keeping a left and a right
 * bound, and emit a corner whenever a bound crosses the opposite one.
 */
function funnel(start: Waypoint, goal: Waypoint, corridors: Array<{ left: Waypoint; right: Waypoint }>): Waypoint[] {
  const path: Waypoint[] = [start];
  let apex = start;
  let left = start;
  let right = start;
  let apexIndex = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  const points = corridors;
  let index = 0;
  while (index < points.length) {
    const nextLeft = points[index].left;
    const nextRight = points[index].right;

    // Tighten the right bound.
    if (triArea2(apex, right, nextRight) <= 0) {
      if (apex === right || triArea2(apex, left, nextRight) > 0) {
        right = nextRight;
        rightIndex = index;
      } else {
        path.push(left);
        apex = left;
        apexIndex = leftIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
        continue;
      }
    }

    // Tighten the left bound.
    if (triArea2(apex, left, nextLeft) >= 0) {
      if (apex === left || triArea2(apex, right, nextLeft) < 0) {
        left = nextLeft;
        leftIndex = index;
      } else {
        path.push(right);
        apex = right;
        apexIndex = rightIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
        continue;
      }
    }

    index += 1;
  }

  path.push(goal);
  return dropDuplicates(path);
}

function dropDuplicates(points: Waypoint[]): Waypoint[] {
  const out: Waypoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.z - point.z) < 1e-6) continue;
    out.push(point);
  }
  return out;
}

/**
 * Taut path between two world points, or null when either end is not on walkable
 * ground or no region route exists. The caller falls back to the grid search.
 */
export function findNavMeshPath(grid: NavGrid, start: Waypoint, goal: Waypoint): Waypoint[] | null {
  const startCell = grid.worldToCell(start.x, start.z);
  const goalCell = grid.worldToCell(goal.x, goal.z);
  if (!startCell || !goalCell) return null;
  if (!grid.isWalkable(startCell.x, startCell.y) || !grid.isWalkable(goalCell.x, goalCell.y)) return null;

  const mesh = navMeshFor(grid);
  const startRect = rectAtCell(mesh, startCell.x, startCell.y);
  const goalRect = rectAtCell(mesh, goalCell.x, goalCell.y);
  if (startRect < 0 || goalRect < 0) return null;
  if (startRect === goalRect) return [start, goal];

  const route = searchRegions(grid, mesh, startRect, goalRect, goal);
  if (!route) return null;

  const corridors = route.portals.map((portalIndex, position) => {
    const from = centreWorld(grid, mesh, route.regions[position]);
    const to = centreWorld(grid, mesh, route.regions[position + 1]);
    return sides(mesh.portals[portalIndex], to.x - from.x, to.z - from.z);
  });

  return funnel(start, goal, corridors);
}

/**
 * The route the runtimes ask for: the taut mesh path when both ends are on the
 * mesh, otherwise the grid search the mesh replaced. Returning null means "no
 * route", which the callers surface to the script as a failed moveTo.
 *
 * The goal snaps to its cell centre. That is the documented contract of
 * `agent.moveTo` / `player.moveTo` - a walk ends at the centre of the goal cell,
 * not at the requested coordinate - and the grid pathfinder always behaved that
 * way. The start does not snap: beginning at the body's real position is what
 * stops the first frame from stepping sideways.
 */
export function findWaypoints(grid: NavGrid, start: Waypoint, goal: Waypoint): Waypoint[] | null {
  const startCell = grid.worldToCell(start.x, start.z);
  const goalCell = grid.worldToCell(goal.x, goal.z);
  if (!startCell || !goalCell) return null;

  const target = grid.cellToWorld(goalCell.x, goalCell.y);

  const taut = findNavMeshPath(grid, start, target);
  if (taut && taut.length >= 2) return taut;

  const path = findPath(grid, startCell, goalCell);
  if (!path) return null;
  const waypoints = smoothWorldPath(grid, path);
  return waypoints.length > 0 ? waypoints : null;
}
