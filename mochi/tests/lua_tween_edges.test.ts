// The edges of TweenInfo: a repeat count that means forever, and a goal key that names
// a property the object does not have.

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

describe('tween edges', () => {
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
    return { node, errors: logs.filter((entry) => entry.level === 'error') };
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

  it('repeats forever when RepeatCount is negative', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      local tween = TweenService:Create(part, TweenInfo.new(0.1, Enum.EasingStyle.Linear, nil, -1), {
        Position = Vector3.new(10, 0, 0)
      })
      tween:Play()
    `);
    expect(errors).toEqual([]);

    // 1.5 cycles in. A clamped repeat count finishes at 0.1s and leaves the part at 10;
    // an endless one is halfway through its second cycle, at 5.
    node.dispatchUpdate(0.15);
    expect(node.position.x).toBeCloseTo(5, 3);
  });

  it('warns about a goal property the object does not have', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0),
        Positon = Vector3.new(0, 0, 0)
      }):Play()
    `);
    expect(errors).toEqual([]);
    const warnings = logs.filter((entry) => entry.level === 'warn' && entry.message.includes('Positon'));
    expect(warnings).toHaveLength(1);

    // The valid half still runs: a typo must not take the whole tween down.
    node.dispatchUpdate(1);
    expect(node.position.x).toBeCloseTo(10, 3);
  });
});
