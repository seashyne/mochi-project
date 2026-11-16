// Scripted player movement: the waypoint follower, the runtime navigation glue
// (grid rebuild, reachable/unreachable targets) and the Lua surface.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { PlayerNavigator, DEFAULT_MOVE_SPEED } from '../src/engine/runtime/playerNavigator';
import { createRuntimeNavigation } from '../src/engine/runtime/runtimeNavigation';
import { createPlayerApi, type RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import type { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';
import type { StudioObject } from '../src/engine/studio/types';

class FakePlayer implements RuntimePlayerHandle {
  readonly id = 'player_local';
  readonly name = 'Tester';
  position: RuntimeVec3;
  velocity: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  health = 100;
  respawns = 0;

  constructor(x: number, y: number, z: number) {
    this.position = { x, y, z };
  }

  getPosition(): RuntimeVec3 { return this.position; }
  setPosition(x: number, y: number, z: number): void { this.position = { x, y, z }; }
  setVelocity(): void { /* not used here */ }
  applyImpulse(): void { /* not used here */ }
  respawn(): void { this.respawns += 1; }
  damage(amount: number): void { this.health -= amount; }
  heal(amount: number): void { this.health += amount; }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

function box(x: number, z: number, sx = 2, sz = 2): StudioObject {
  return {
    id: `b-${x}-${z}`,
    name: 'Wall',
    type: 'block',
    position: { x, y: 0, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: sx, y: 2, z: sz },
    color: '#ffffff',
    anchored: true,
    canCollide: true
  } as StudioObject;
}

// A wall spanning the whole grid with a 4 metre gap around x = 0.
const WALL: StudioObject[] = [box(-11, 0, 18, 2), box(11, 0, 18, 2)];
const BOUNDS = { bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 } };

describe('PlayerNavigator', () => {
  it('walks toward a single waypoint and stops there', () => {
    const player = new FakePlayer(0, 2, 0);
    const navigator = new PlayerNavigator(player);

    expect(navigator.begin([{ x: 4, z: 0 }])).toBe(true);
    for (let tick = 0; tick < 40 && navigator.isActive; tick += 1) navigator.update(0.05);
    expect(navigator.isActive).toBe(false);
    expect(player.position.x).toBeCloseTo(4, 5);
  });

  it('uses the requested speed over the default', () => {
    const player = new FakePlayer(0, 2, 0);
    const navigator = new PlayerNavigator(player);
    navigator.begin([{ x: 10, z: 0 }], DEFAULT_MOVE_SPEED * 2);
    navigator.update(0.5);
    expect(player.position.x).toBeCloseTo(DEFAULT_MOVE_SPEED, 5);
  });

  it('keeps the height untouched', () => {
    const player = new FakePlayer(0, 7, 0);
    const navigator = new PlayerNavigator(player);
    navigator.begin([{ x: 1, z: 0 }]);
    navigator.update(0.1);
    expect(player.position.y).toBe(7);
  });

  it('refuses an empty route', () => {
    const navigator = new PlayerNavigator(new FakePlayer(0, 2, 0));
    expect(navigator.begin([])).toBe(false);
    expect(navigator.isActive).toBe(false);
  });

  it('a stop mid-walk freezes the player where it stands', () => {
    const player = new FakePlayer(0, 2, 0);
    const navigator = new PlayerNavigator(player);
    navigator.begin([{ x: 100, z: 0 }]);
    navigator.update(0.1);
    navigator.stop();
    const frozen = player.position.x;
    navigator.update(0.1);
    expect(player.position.x).toBe(frozen);
  });
});

describe('createRuntimeNavigation', () => {
  it('routes through the gap in a wall', () => {
    const player = new FakePlayer(0, 0, -1.5);
    const navigation = createRuntimeNavigation(player, { cellSize: 1, agentRadius: 0, ...BOUNDS });
    navigation.setObjects(WALL);

    expect(navigation.moveTo(0, 1.5)).toBe(true);
    for (let tick = 0; tick < 100 && navigation.isMoving(); tick += 1) navigation.update(0.05);

    expect(player.position.z).toBeCloseTo(1.5, 2);
  });

  it('refuses a target inside an obstacle', () => {
    const player = new FakePlayer(0, 0, -1.5);
    const navigation = createRuntimeNavigation(player, { cellSize: 1, agentRadius: 0, ...BOUNDS });
    navigation.setObjects(WALL);
    expect(navigation.moveTo(-11, 0)).toBe(false);
  });

  it('refuses a target outside the grid', () => {
    const player = new FakePlayer(0, 0, -1.5);
    const navigation = createRuntimeNavigation(player, { cellSize: 1, agentRadius: 0, ...BOUNDS });
    navigation.setObjects(WALL);
    expect(navigation.moveTo(0, 500)).toBe(false);
  });

  it('re-bakes the grid when the object list changes', () => {
    const player = new FakePlayer(0, 0, -1.5);
    const navigation = createRuntimeNavigation(player, { cellSize: 1, agentRadius: 0, ...BOUNDS });
    navigation.setObjects(WALL);
    expect(navigation.moveTo(0, 1.5)).toBe(true);

    // Seal the gap; the same target is now unreachable.
    navigation.setObjects([...WALL, box(0, 0, 6, 2)]);
    expect(navigation.moveTo(0, 1.5)).toBe(false);
  });

  it('bakes lazily: no objects means no grid and no crash', () => {
    const player = new FakePlayer(0, 0, 0);
    const navigation = createRuntimeNavigation(player);
    expect(navigation.moveTo(1, 1)).toBe(false);
  });
});

describe('Lua player.moveTo', () => {
  async function runScript(code: string, navigation?: { moveTo: (x: number, z: number, s?: number) => boolean; stop: () => void; isMoving: () => boolean }) {
    const world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    const state = new GameState();
    const logs: string[] = [];
    const deps: RuntimeApiDeps = {
      world,
      player: new FakePlayer(0, 2, 0),
      audio: { play: () => undefined } as never,
      state,
      log: (_level, message) => logs.push(message),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 2, z: 0 }),
      getTime: () => 0,
      navigation
    };
    deps.playerApi = createPlayerApi(deps);
    const node = world.spawn({
      id: 'n1', name: 'N', type: 'block',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
      color: '#fff', anchored: true, canCollide: false, luaScript: ''
    } as StudioObject);
    const context = new ScriptContext({ node, code, deps });
    await context.start();
    context.dispose();
    world.clear();
    state.dispose();
    return logs;
  }

  it('forwards coordinates and speed to the bridge', async () => {
    const calls: Array<[number, number, number | undefined]> = [];
    const logs = await runScript('player.moveTo(3, 4, 2.5)', {
      moveTo: (x, z, s) => { calls.push([x, z, s]); return true; },
      stop: () => undefined,
      isMoving: () => true
    });
    expect(calls).toEqual([[3, 4, 2.5]]);
    expect(logs.some((entry) => entry.includes('[Nav] moveTo(3, 4) started'))).toBe(true);
  });

  it('reports unreachable targets as false in Lua', async () => {
    const logs = await runScript('print(player.moveTo(9, 9))', {
      moveTo: () => false,
      stop: () => undefined,
      isMoving: () => false
    });
    expect(logs).toContain('false');
  });

  it('rejects non-numeric targets without calling the bridge', async () => {
    const calls: unknown[] = [];
    const logs = await runScript('print(player.moveTo("no", 1))', {
      moveTo: (...args) => { calls.push(args); return true; },
      stop: () => undefined,
      isMoving: () => false
    });
    expect(calls).toEqual([]);
    expect(logs).toContain('false');
  });

  it('runs the documented RUNTIME.md example without errors', async () => {
    const stops: number[] = [];
    const logs = await runScript([
      'if player.moveTo(12, -8, 5) then',
      '    script.onUpdate.Connect(function(dt)',
      '        if player.health <= 30 then',
      '            player.stopMoving()',
      '        end',
      '    end)',
      'end'
    ].join('\n'), {
      moveTo: () => true,
      stop: () => stops.push(1),
      isMoving: () => true
    });
    expect(logs.filter((entry) => entry.includes('Script error'))).toEqual([]);
    expect(stops).toEqual([]);
  });

  it('is a no-op without a bridge', async () => {
    const logs = await runScript('print(player.isMoving())');
    expect(logs).toContain('false');
  });
});

describe('grid rebuild discipline', () => {
  const OPTIONS = {
    cellSize: 1,
    agentRadius: 0.4,
    bounds: { minX: -12, minZ: -12, maxX: 12, maxZ: 12 }
  };

  it('keeps the baked grid when the same objects arrive in a new array', () => {
    // `sync()` runs on a 250 ms timer and rebuilds the array every time, so an
    // identity check on the array would rebake the world four times a second.
    const scene = [box(-4, 0), box(4, 0)];
    const navigation = createRuntimeNavigation(new FakePlayer(0, 1, 0), OPTIONS);

    navigation.setObjects(scene);
    const first = navigation.grid();

    navigation.setObjects([...scene]);
    expect(navigation.grid()).toBe(first);

    navigation.setObjects(scene.slice(1));
    expect(navigation.grid()).not.toBe(first);
  });

  it('uses the sparse bake by default while rejecting disconnected targets via the navmesh', () => {
    const player = new FakePlayer(-6, 0, 0);
    const fullWall: StudioObject[] = [box(0, 0, 2, 40)];
    const navigation = createRuntimeNavigation(player, { cellSize: 1, agentRadius: 0, ...BOUNDS });
    navigation.setObjects(fullWall);

    expect(navigation.grid().regions).toBeNull();
    expect(navigation.moveTo(6, 0)).toBe(false);
    expect(navigation.moveTo(-6, 4)).toBe(true);
  });
});
