// Tests for PVInstance GetPivot/PivotTo, Part.PivotOffset, Model.WorldPivot, and Model.PrimaryPart.

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

describe('Lua Model and Part pivots', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const defaults = OBJECT_TYPE_DEFAULTS.model;
    const def: StudioObject = {
      id: 'model_root',
      name: 'TestModel',
      type: 'model',
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
    return { model: node, errors: logs.filter((entry) => entry.level === 'error') };
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

  it('computes Model pivot from bounding center and translates/rotates children rigidly', async () => {
    const { errors } = await run(`
      local model = script.Parent
      local left = Instance.new("Part", model, { Name = "Left", Position = Vector3.new(10, 0, 0), Size = Vector3.new(2, 2, 2) })
      local right = Instance.new("Part", model, { Name = "Right", Position = Vector3.new(14, 0, 0), Size = Vector3.new(2, 2, 2) })

      local initialPivot = model:GetPivot()
      assert(math.abs(initialPivot.Position.x - 12) < 1e-4)

      -- Translate pivot from (12, 0, 0) to (20, 5, 0) and rotate +90 deg around Y.
      model:PivotTo(CFrame.new(20, 5, 0) * CFrame.Angles(0, math.pi / 2, 0))

      local after = model:GetPivot()
      assert(math.abs(after.Position.x - 20) < 1e-4)
      assert(math.abs(after.Position.y - 5) < 1e-4)
      assert(math.abs(after.Position.z - 0) < 1e-4)

      -- Left was at (-2, 0, 0) relative to pivot -> rotated +90 deg around Y lands at (20, 5, +2).
      assert(math.abs(left.Position.x - 20) < 1e-4)
      assert(math.abs(left.Position.y - 5) < 1e-4)
      assert(math.abs(left.Position.z - 2) < 1e-4)

      -- Right was at (+2, 0, 0) relative to pivot -> rotated +90 deg around Y lands at (20, 5, -2).
      assert(math.abs(right.Position.x - 20) < 1e-4)
      assert(math.abs(right.Position.y - 5) < 1e-4)
      assert(math.abs(right.Position.z - (-2)) < 1e-4)
    `);
    expect(errors).toEqual([]);
  });

  it('uses PrimaryPart when set and preserves child offsets on PivotTo', async () => {
    const { errors } = await run(`
      local model = script.Parent
      local hub = Instance.new("Part", model, { Name = "Hub", Position = Vector3.new(4, 1, 0), Size = Vector3.new(2, 2, 2) })
      local arm = Instance.new("Part", model, { Name = "Arm", Position = Vector3.new(4, 1, 3), Size = Vector3.new(1, 1, 1) })
      model.PrimaryPart = hub

      assert(model.PrimaryPart.id == hub.id)
      assert(math.abs(model:GetPivot().Position.x - 4) < 1e-4)

      local movedEvents = 0
      arm:GetPropertyChangedSignal("Position"):Connect(function()
        movedEvents = movedEvents + 1
      end)

      model:PivotTo(CFrame.new(10, 2, 5))
      assert(math.abs(hub.Position.x - 10) < 1e-4)
      assert(math.abs(hub.Position.y - 2) < 1e-4)
      assert(math.abs(hub.Position.z - 5) < 1e-4)
      assert(math.abs(arm.Position.x - 10) < 1e-4)
      assert(math.abs(arm.Position.y - 2) < 1e-4)
      assert(math.abs(arm.Position.z - 8) < 1e-4)
      assert(movedEvents == 1)
    `);
    expect(errors).toEqual([]);
  });

  it('supports WorldPivot override on models and PivotOffset on individual parts', async () => {
    const { errors } = await run(`
      local model = script.Parent
      model.WorldPivot = CFrame.new(3, 4, 5)
      assert(math.abs(model:GetPivot().Position.x - 3) < 1e-4)

      local pillar = Instance.new("Part", { Name = "Pillar", Position = Vector3.new(0, 0, 0), Size = Vector3.new(2, 4, 2) })
      pillar.PivotOffset = CFrame.new(0, -2, 0)
      assert(math.abs(pillar:GetPivot().Position.y - (-2)) < 1e-4)

      -- Placing the bottom pivot at y = 0 lifts the part center to y = 2.
      pillar:PivotTo(CFrame.new(7, 0, -1))
      assert(math.abs(pillar.Position.x - 7) < 1e-4)
      assert(math.abs(pillar.Position.y - 2) < 1e-4)
      assert(math.abs(pillar.Position.z - (-1)) < 1e-4)

      -- Invalid PivotTo values are ignored cleanly without throwing.
      pillar:PivotTo("not a cframe")
      assert(math.abs(pillar.Position.x - 7) < 1e-4)
    `);
    expect(errors).toEqual([]);
  });
});
