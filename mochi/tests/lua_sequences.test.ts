// Tests for NumberSequence, NumberSequenceKeypoint, ColorSequence, and ColorSequenceKeypoint.

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

describe('Lua NumberSequence and ColorSequence', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    const def: StudioObject = {
      id: 'part_seq',
      name: 'SeqPart',
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
    for (const ctx of contexts) ctx.dispose();
  });

  it('constructs NumberSequence from constant, two-number, and keypoint arrays', async () => {
    const { errors } = await run(`
      local constant = NumberSequence.new(5)
      assert(#constant.Keypoints == 2)
      assert(constant.Keypoints[1].Time == 0 and constant.Keypoints[1].Value == 5)
      assert(constant.Keypoints[2].Time == 1 and constant.Keypoints[2].Value == 5)

      local ramp = NumberSequence.new(2, 10)
      assert(math.abs(ramp:Evaluate(0.25) - 4) < 1e-6)
      assert(math.abs(ramp:Evaluate(-1) - 2) < 1e-6)
      assert(math.abs(ramp:Evaluate(2) - 10) < 1e-6)

      local curve = NumberSequence.new({
        NumberSequenceKeypoint.new(1, 20, 2),
        NumberSequenceKeypoint.new(0, 0, 1),
        NumberSequenceKeypoint.new(0.5, 10, 0.5)
      })
      assert(curve.Keypoints[1].Time == 0 and curve.Keypoints[2].Time == 0.5)
      assert(curve.Keypoints[3].Envelope == 2)
      assert(math.abs(curve:Evaluate(0.25) - 5) < 1e-6)
      assert(math.abs(curve:Evaluate(0.75) - 15) < 1e-6)
    `);
    expect(errors).toEqual([]);
  });

  it('constructs ColorSequence from Color3 userdata and interpolates onto a part', async () => {
    const { node, errors } = await run(`
      local solid = ColorSequence.new(Color3.new(1, 0, 0))
      assert(#solid.Keypoints == 2)
      assert(solid.Keypoints[1].Value.r == 1 and solid.Keypoints[2].Value.g == 0)

      local gradient = ColorSequence.new(Color3.new(1, 0, 0), Color3.new(0, 0, 1))
      local mid = gradient:Evaluate(0.5)
      assert(math.abs(mid.r - 0.5) < 1e-6)
      assert(math.abs(mid.g - 0) < 1e-6)
      assert(math.abs(mid.b - 0.5) < 1e-6)

      local multi = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(0, 0, 0)),
        ColorSequenceKeypoint.new(0.5, Color3.fromRGB(0, 255, 0)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 255, 255))
      })
      local c = multi:Evaluate(0.25)
      assert(math.abs(c.g - 0.5) < 0.01)
      script.Parent.Color = multi:Evaluate(0.5)
    `);
    expect(errors).toEqual([]);
    expect(node.def.color).toBe('#00ff00');
  });

  it('clamps out-of-range keypoint times and normalizes single-keypoint tables', async () => {
    const { errors } = await run(`
      local single = NumberSequence.new({ NumberSequenceKeypoint.new(-2, 7, 1) })
      assert(#single.Keypoints == 2)
      assert(single.Keypoints[1].Time == 0 and single.Keypoints[2].Time == 1)
      assert(single:Evaluate(0.5) == 7)

      local kp = ColorSequenceKeypoint.new(5, Color3.new(2, -1, 0.5))
      assert(kp.Time == 1)
      assert(kp.Value.r == 1 and kp.Value.g == 0 and kp.Value.b == 0.5)
    `);
    expect(errors).toEqual([]);
  });
});
