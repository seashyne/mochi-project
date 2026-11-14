// Scripted NPC movement: one waypoint follower per agent, plus reciprocal spacing.
//
// Agents are ordinary scene objects of type `agent`. They are not obstacles, so
// they reuse the player's nav grid instead of baking their own, and the runtime
// advances them from the same tick as the player walk. After every tick,
// overlapping agents are pushed apart - that is what stops two NPCs sharing a lane
// from walking through each other and through the player.

import { findWaypoints } from '../navigation/navMeshPath';
import { DEFAULT_MAX_STEP, resolveOverlaps, type OverlapBody } from '../navigation/localAvoidance';
import { solveOrca, type OrcaBody } from '../navigation/orca';
import { solveOrcaWasm } from '../navigation/wasmOrca';
import { DEFAULT_MOVE_SPEED } from './playerNavigator';
import type { NavGrid } from '../navigation/navGrid';
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

export interface AgentRuntimeOptions {
  /** Disc radius used for spacing, in metres. Defaults to 0.45. */
  agentRadius?: number;
  /** Immovable bodies agents must not overlap, such as the player. */
  staticBodies?: () => Array<{ position: RuntimeVec3; radius: number }>;
  /** Cap on one separation step, in metres. Defaults to the resolver's. */
  maxStep?: number;
}

export interface RuntimeAgents extends AgentApi {
  /** Resident objects; drops navigators for agents that left the world. */
  setObjects: (objects: StudioObject[]) => void;
  update: (dt: number) => void;
  stopAll: () => void;
}

export function createRuntimeAgents(
  resolve: (key: string) => AgentBody | null,
  getGrid: () => NavGrid,
  options: AgentRuntimeOptions = {}
): RuntimeAgents {
  const radius = Math.max(options.agentRadius ?? 0.45, 0);
  const navigators = new Map<string, PlayerNavigator>();
  /** Every agent that should take part in spacing, moving or not. */
  const agentIds = new Set<string>();

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

  /** Pushes overlapping agents apart, treating the player as immovable. */
  /**
   * Velocity-space avoidance, applied as a correction on top of whatever the
   * navigators did this tick. ORCA needs a velocity, and the navigator only
   * produces a position, so the step it just took is the preferred velocity -
   * agents yield before they touch instead of being pushed apart afterwards.
   *
   * The positional pass still runs after this: ORCA assumes it starts outside
   * every disc, and a teleport or a spawn can break that assumption.
   */
  const avoid = (dt: number, before: Map<string, { x: number; z: number }>): void => {
    if (!(dt > 0) || before.size === 0) return;

    const bodies: OrcaBody[] = [];
    const movers: AgentBody[] = [];
    for (const id of new Set([...agentIds, ...navigators.keys()])) {
      const body = resolve(id);
      if (!body) continue;
      const position = body.getPosition();
      const previous = before.get(id);
      const vx = previous ? (position.x - previous.x) / dt : 0;
      const vz = previous ? (position.z - previous.z) / dt : 0;
      bodies.push({
        x: position.x,
        z: position.z,
        vx,
        vz,
        radius,
        // Never cap below what the navigator already asked for, or normal
        // walking would be slowed by the avoidance layer.
        maxSpeed: Math.max(Math.hypot(vx, vz), DEFAULT_MOVE_SPEED),
        weight: 1
      });
      movers.push(body);
    }
    for (const stat of options.staticBodies?.() ?? []) {
      bodies.push({
        x: stat.position.x,
        z: stat.position.z,
        vx: 0,
        vz: 0,
        radius: stat.radius,
        maxSpeed: 0,
        weight: 0
      });
    }
    if (bodies.length < 2) return;

    const solved = solveOrcaWasm(bodies, { timeHorizon: 1.2, timeStep: dt }) ?? solveOrca(bodies, { timeHorizon: 1.2, timeStep: dt });
    const maxStep = options.maxStep ?? DEFAULT_MAX_STEP;

    for (let index = 0; index < movers.length; index += 1) {
      const deltaX = (solved[index].vx - bodies[index].vx) * dt;
      const deltaZ = (solved[index].vz - bodies[index].vz) * dt;
      const length = Math.hypot(deltaX, deltaZ);
      if (length < 1e-6) continue;
      const scale = length > maxStep ? maxStep / length : 1;
      const body = movers[index];
      const position = body.getPosition();
      body.setPosition(position.x + deltaX * scale, position.y, position.z + deltaZ * scale);
    }
  };

  const separate = (): void => {
    const bodies: OverlapBody[] = [];
    const movers: AgentBody[] = [];
    for (const id of new Set([...agentIds, ...navigators.keys()])) {
      const body = resolve(id);
      if (!body) continue;
      const position = body.getPosition();
      bodies.push({ x: position.x, z: position.z, radius, weight: 1 });
      movers.push(body);
    }
    for (const stat of options.staticBodies?.() ?? []) {
      bodies.push({ x: stat.position.x, z: stat.position.z, radius: stat.radius, weight: 0 });
    }
    if (bodies.length < 2) return;

    resolveOverlaps(bodies, { maxStep: options.maxStep });

    for (let index = 0; index < movers.length; index += 1) {
      const body = movers[index];
      const before = body.getPosition();
      const after = bodies[index];
      if (Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.z - before.z) < 1e-6) continue;
      // Height belongs to the walk, not the spacing pass.
      body.setPosition(after.x, before.y, after.z);
    }
  };

  return {
    setObjects(objects) {
      const live = new Set(
        objects.filter((object) => object.type === 'agent').map((object) => object.id)
      );
      // Runtime-spawned agents never appear in the list but still resolve.
      for (const id of [...navigators.keys()]) {
        if (!live.has(id) && !resolve(id)) navigators.delete(id);
      }
      for (const id of [...agentIds]) {
        if (!live.has(id) && !resolve(id)) agentIds.delete(id);
      }
      live.forEach((id) => agentIds.add(id));
    },

    update(dt) {
      // Remember where every walking agent started so its step becomes the
      // preferred velocity the avoidance solver needs.
      const before = new Map<string, { x: number; z: number }>();
      for (const [id, navigator] of navigators) {
        if (!navigator.isActive) continue;
        const body = resolve(id);
        if (!body) continue;
        const position = body.getPosition();
        before.set(id, { x: position.x, z: position.z });
        navigator.update(dt);
      }
      avoid(dt, before);
      separate();
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

      const waypoints = findWaypoints(grid, { x: from.x, z: from.z }, { x, z });
      if (!waypoints) return false;

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
