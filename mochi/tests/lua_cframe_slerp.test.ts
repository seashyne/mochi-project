// Rotation has to interpolate on the sphere. Blending the nine matrix components is
// only right for nearly identical rotations: halfway through a 180 degree turn every
// component lands on zero and the part vanishes, and halfway through 90 degrees the
// basis is not unit length, so the part visibly shrinks and grows on the way.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { OBJECT_TYPE_DEFAULTS, StudioObject } from '../src/engine/studio/types';
import { AudioBus } from '../src/engine/runtime/audioBus';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeApiDeps, createPlayerApi } from '../src/engine/runtime/luaNodeApi';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';

class StubPlayer implements RuntimePlayerHandle {
  readonly id = 'player_local';
  readonly name = 'Tester';
  position: RuntimeVec3 = { x: 0, y: 2, z: 0 };
  velocity: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  health = 100;
  getPosition(): RuntimeVec3 { return this.position; }
  setPosition(x: number, y: number, z: number): void { this.position = { x, y, z }; }
  setVelocity(): void { /* unused */ }
  applyImpulse(): void { /* unused */ }
  respawn(): void { /* unused */ }
  damage(): void { /* unused */ }
  heal(): void { /* unused */ }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

describe('CFrame:Lerp rotation', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    const def: StudioObject = {
      id: 'part_1',
      name: 'Part_1',
      type: 'block',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale },
      color: defaults.defaultColor,
      anchored: true
    };
    const node = world.spawn(def);
    const context = new ScriptContext({ node, code: script, deps });
    contexts.push(context);
    await context.start();
    return { errors: logs.filter((entry) => entry.level === 'error') };
  }

  beforeEach(() => {
    world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    state = new GameState();
    logs = [];
    contexts = [];
    deps = {
      world,
      player: new StubPlayer(),
      audio: {
        play: vi.fn(),
        setListener: () => undefined,
        setMuted: () => undefined,
        isMuted: () => false
      } as unknown as AudioBus,
      state,
      log: (level, message) => logs.push({ level, message }),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0
    };
    deps.playerApi = createPlayerApi(deps);
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
  });

  it('keeps the basis unit length halfway through a 180 degree turn', async () => {
    const { errors } = await run(`
      local mid = CFrame.Angles(0, math.pi, 0):Lerp(CFrame.new(), 0.5)
      local x = math.sqrt(mid.m00 * mid.m00 + mid.m10 * mid.m10 + mid.m20 * mid.m20)
      local y = math.sqrt(mid.m01 * mid.m01 + mid.m11 * mid.m11 + mid.m21 * mid.m21)
      print(string.format("%.3f %.3f", x, y))
    `);
    expect(errors).toEqual([]);
    const [x, y] = (logs[0].message as string).split(' ').map(Number);
    // Blending components put these at 0 - the part collapsed to a point.
    expect(x).toBeCloseTo(1, 2);
    expect(y).toBeCloseTo(1, 2);
  });

  it('lands on the halfway rotation for a quarter turn', async () => {
    const { errors } = await run(`
      local mid = CFrame.Angles(0, math.pi / 2, 0):Lerp(CFrame.new(), 0.5)
      local half = CFrame.Angles(0, math.pi / 4, 0)
      print(string.format("%.4f %.4f %.4f", mid.m00 - half.m00, mid.m02 - half.m02, mid.m20 - half.m20))
    `);
    expect(errors).toEqual([]);
    const deltas = (logs[0].message as string).split(' ').map(Number);
    for (const delta of deltas) expect(Math.abs(delta)).toBeLessThan(0.01);
  });

  it('returns the endpoints exactly', async () => {
    const { errors } = await run(`
      local a = CFrame.new(1, 2, 3) * CFrame.Angles(0.3, 1.1, -0.4)
      local b = CFrame.new(-4, 0, 9) * CFrame.Angles(-0.7, 0.2, 1.9)
      local at0 = a:Lerp(b, 0)
      local at1 = a:Lerp(b, 1)
      print(string.format("%.4f %.4f", math.abs(at0.m01 - a.m01), math.abs(at1.m01 - b.m01)))
    `);
    expect(errors).toEqual([]);
    const [start, finish] = (logs[0].message as string).split(' ').map(Number);
    expect(start).toBeLessThan(0.0001);
    expect(finish).toBeLessThan(0.0001);
  });

  it('takes the short way round rather than the long one', async () => {
    const { errors } = await run(`
      -- 350 degrees the long way is 10 the short way; the midpoint must be near 355.
      local a = CFrame.Angles(0, math.rad(-5), 0)
      local b = CFrame.Angles(0, math.rad(5), 0)
      local mid = a:Lerp(b, 0.5)
      local straight = CFrame.new()
      print(string.format("%.3f", mid.m00 - straight.m00))
    `);
    expect(errors).toEqual([]);
    // A slerp between -5 and 5 degrees sits within a degree of identity at the middle.
    const delta = Math.abs(Number(logs[0].message));
    expect(delta).toBeLessThan(0.01);
  });
});
