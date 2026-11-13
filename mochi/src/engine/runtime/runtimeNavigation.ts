// Glue between the Lua `player.moveTo` call and the pathfinding module.
//
// Owns the nav grid for the resident object list: it is rebuilt lazily, the
// first time a route is requested after a sync, so a chunked world re-bakes as
// it streams in without costing anything on worlds that never navigate.

import { buildNavGrid, type NavGridFromSceneOptions } from '../navigation/navGridFromScene';
import { findPath } from '../navigation/astar';
import { smoothWorldPath } from '../navigation/pathSmoothing';
import { NavGrid } from '../navigation/navGrid';
import { PlayerNavigator } from './playerNavigator';
import type { RuntimePlayerHandle } from './types';
import type { StudioObject } from '../studio/types';

/** The surface Lua sees. Mirrored structurally in RuntimeApiDeps. */
export interface RuntimeNavigationApi {
  /** Walks to a world position. False when no route exists. */
  moveTo: (x: number, z: number, speed?: number) => boolean;
  /** Cancels an active walk. */
  stop: () => void;
  /** True while a scripted walk is in progress. */
  isMoving: () => boolean;
}

export interface RuntimeNavigation extends RuntimeNavigationApi {
  /** Latest resident objects; the next route re-bakes the grid. */
  setObjects: (objects: StudioObject[]) => void;
  /** Advances the walk. Call once per frame after physics. */
  update: (dt: number) => void;
}

export function createRuntimeNavigation(
  player: RuntimePlayerHandle,
  options: NavGridFromSceneOptions = {}
): RuntimeNavigation {
  let objects: StudioObject[] = [];
  let grid: NavGrid | null = null;
  const navigator = new PlayerNavigator(player);

  const ensureGrid = (): NavGrid => {
    if (!grid) grid = buildNavGrid(objects, options);
    return grid;
  };

  return {
    setObjects(next) {
      objects = next;
      grid = null;
    },

    update(dt) {
      navigator.update(dt);
    },

    isMoving: () => navigator.isActive,

    stop: () => navigator.stop(),

    moveTo(x, z, speed) {
      const nav = ensureGrid();
      const position = player.getPosition();
      const start = nav.worldToCell(position.x, position.z);
      const goal = nav.worldToCell(x, z);
      if (!start || !goal) return false;

      const path = findPath(nav, start, goal);
      if (!path) return false;

      const waypoints = smoothWorldPath(nav, path);
      if (waypoints.length === 0) return false;

      return navigator.begin(waypoints, speed);
    }
  };
}
