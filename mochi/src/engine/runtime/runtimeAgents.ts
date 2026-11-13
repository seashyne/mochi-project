// Scripted NPC movement: one waypoint follower per `agent` object.
//
// Agents are ordinary scene objects of type `agent`. They are not obstacles, so
// they reuse the player's nav grid instead of baking their own, and the runtime
// advances them from the same tick as the player walk.

import { findPath } from '../navigation/astar';
import type { NavGrid } from '../navigation/navGrid';
import { smoothWorldPath } from '../navigation/pathSmoothing';
import { PlayerNavigator, type NavigableBody } from './playerNavigator';
import type { StudioObject } from '../studio/types';
import type { RuntimeVec3 } from './types';

/** What an agent key resolves to. The runtime passes live nodes in. */
export interface AgentBody extends NavigableBody {
  readonly id: string;
}

/** The Lua surface. Mirrored structurally on RuntimeApiDeps. */
export interface AgentApi {
  /** Walks an agent to a world position. False when the key or the route is missing. */
  moveTo: (key: string, x: number, z: number, speed?: number) => boolean;
  stop: (key: string) => void;
  isMoving: (key: string) => boolean;
  /** Agent position, or the origin when the key does not resolve. */
  position: (key: string) => RuntimeVec3;
}

export interface RuntimeAgents extends AgentApi {
  /** Resident objects; drops navigators for agents that left the world. */
  setObjects: (objects: StudioObject[]) => void;
  update: (dt: number) => void;
  stopAll: () => void;
}

export function createRuntimeAgents(
  resolve: (key: string) => AgentBody | null,
  getGrid: () => NavGrid
): RuntimeAgents {
  const navigators = new Map<string, PlayerNavigator>();

  const navigatorFor = (key: string): { body: AgentBody; navigator: PlayerNavigator } | null => {
    const body = resolve(key);
    if (!body) return null;
    let navigator = navigators.get(body.id);
    if (!navigator) {
      navigator = new PlayerNavigator(body);
      navigators.set(body.id, navigator);
    }
    return { body, navigator };
  };

  return {
    setObjects(objects) {
      const live = new Set(
        objects.filter((object) => object.type === 'agent').map((object) => object.id)
      );
      for (const id of [...navigators.keys()]) {
        // Runtime-spawned agents never appear in the list but still resolve.
        if (!live.has(id) && !resolve(id)) navigators.delete(id);
      }
    },

    update(dt) {
      for (const navigator of navigators.values()) {
        if (navigator.isActive) navigator.update(dt);
      }
    },

    stopAll() {
      for (const navigator of navigators.values()) navigator.stop();
    },

    moveTo(key, x, z, speed) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const target = navigatorFor(key);
      if (!target) return false;

      const grid = getGrid();
      const from = target.body.getPosition();
      const start = grid.worldToCell(from.x, from.z);
      const goal = grid.worldToCell(x, z);
      if (!start || !goal) return false;

      const path = findPath(grid, start, goal);
      if (!path) return false;
      const waypoints = smoothWorldPath(grid, path);
      if (waypoints.length === 0) return false;

      return target.navigator.begin(waypoints, speed);
    },

    stop(key) {
      navigatorFor(key)?.navigator.stop();
    },

    isMoving(key) {
      return navigatorFor(key)?.navigator.isActive ?? false;
    },

    position(key) {
      const body = resolve(key);
      return body ? { ...body.getPosition() } : { x: 0, y: 0, z: 0 };
    }
  };
}
