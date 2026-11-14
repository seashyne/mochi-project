// Tweening a GUI object. The values a GUI property takes - UDim2, UDim, Color3, Vector2 -
// are not numbers, so the tween has to blend their fields rather than pass the target
// through. A UDim2 that jumps instead of growing is the failure this covers.

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

describe('tweening a GUI object', () => {
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

  it('grows a UDim2 through the middle instead of jumping', async () => {
    const { node, errors } = await run(`
      local frame = Instance.new("Frame", nil, { Size = UDim2.new(0, 100, 0, 50) })
      print("start:" .. tostring(frame.Size.xOffset))
      TweenService:Create(frame, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Size = UDim2.new(0, 200, 0, 50)
      }):Play()
      local frames = 0
      RunService.Heartbeat:Connect(function()
        frames = frames + 1
        if frames == 1 then print("mid:" .. string.format("%.1f", frame.Size.xOffset)) end
      end)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'start:100')).toBe(true);

    node.dispatchUpdate(0.5);
    const mid = logs.map((entry) => entry.message).find((message) => message.startsWith('mid:'));
    expect(mid).toBeDefined();
    expect(Number(String(mid).slice(4))).toBeCloseTo(150, 0);
  });

  it('leaves the fields it is not tweening alone', async () => {
    const { node, errors } = await run(`
      local frame = Instance.new("Frame", nil, { Size = UDim2.new(0, 100, 0, 50) })
      TweenService:Create(frame, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Size = UDim2.new(0, 200, 0, 50)
      }):Play()
      local frames = 0
      RunService.Heartbeat:Connect(function()
        frames = frames + 1
        if frames == 1 then print("y:" .. string.format("%.1f", frame.Size.yOffset)) end
      end)
    `);
    expect(errors).toEqual([]);
    node.dispatchUpdate(0.5);
    const y = logs.map((entry) => entry.message).find((message) => message.startsWith('y:'));
    expect(y).toBe('y:50.0');
  });

  it('reaches the target exactly when it finishes', async () => {
    const { node, errors } = await run(`
      local frame = Instance.new("Frame", nil, { Size = UDim2.new(0, 100, 0, 50) })
      local tween = TweenService:Create(frame, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Size = UDim2.new(0, 200, 0, 50)
      })
      tween.Completed:Connect(function()
        print("end:" .. string.format("%.0f", frame.Size.xOffset))
      end)
      tween:Play()
    `);
    expect(errors).toEqual([]);
    node.dispatchUpdate(1);
    expect(logs.some((entry) => entry.message === 'end:200')).toBe(true);
  });
});
