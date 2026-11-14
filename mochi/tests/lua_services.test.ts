// RunService.Heartbeat: the per-frame hook ported scripts reach for. It has to fire
// with the frame delta, and it must not be a second loop - a spawned loop cannot yield
// on the main thread and would freeze the session.

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

describe('RunService', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    const def: StudioObject = {
      id: 'part_1', name: 'Part_1', type: 'block',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale }, color: defaults.defaultColor, anchored: true
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
      audio: { play: vi.fn(), setListener: () => undefined, setMuted: () => undefined, isMuted: () => false } as unknown as AudioBus,
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

  it('fires once per frame with the delta', async () => {
    const { node, errors } = await run(`
      RunService.Heartbeat:Connect(function(dt)
        print(string.format("beat %.3f", dt))
      end)
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.016);
    node.dispatchUpdate(0.016);

    expect(logs.filter((entry) => entry.message.startsWith('beat')).map((entry) => entry.message))
      .toEqual(['beat 0.016', 'beat 0.016']);
  });

  it('reports the side it runs on', async () => {
    const { errors } = await run(`
      print(tostring(RunService.IsClient) .. "," .. tostring(RunService.IsServer))
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'true,false')).toBe(true);
  });

  it('tweens a position over time and reports completion', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      local info = TweenInfo.new(1, Enum.EasingStyle.Linear)
      info.Completed = function() print("done") end
      TweenService:Create(part, info, { Position = Vector3.new(10, 0, 0) }):Play()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(5, 4);

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(10, 4);
    expect(logs.some((entry) => entry.message === 'done')).toBe(true);
  });

  it('stops a tween that was cancelled', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      local tween = TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0)
      })
      tween:Play()
      tween:Cancel()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(0, 4);
  });

  it('tweens a CFrame along the shortest rotation', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.CFrame = CFrame.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        CFrame = CFrame.new(0, 10, 0) * CFrame.Angles(0, math.pi / 2, 0)
      }):Play()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(1);
    expect(node.position.y).toBeCloseTo(10, 3);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2, 3);
  });

  it('accepts RenderStepped as the same event', async () => {
    const { node, errors } = await run(`
      RunService.RenderStepped:Connect(function(dt) print("render " .. dt) end)
    `);
    expect(errors).toEqual([]);
    node.dispatchUpdate(0.5);
    expect(logs.some((entry) => entry.message === 'render 0.5')).toBe(true);
  });

  it('fires Completed as a signal and stops after Disconnect', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      local tween = TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0)
      })
      local connection = tween.Completed:Connect(function() print("fired") end)
      tween.Completed:Connect(function() connection:Disconnect() end)
      tween:Play()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(1.1);
    expect(logs.filter((entry) => entry.message === 'fired')).toHaveLength(1);
  });

  it('waits out DelayTime before it moves', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 0, false, 0.5), {
        Position = Vector3.new(10, 0, 0)
      }):Play()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.25);
    expect(node.position.x).toBeCloseTo(0, 4);

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(5, 4);
  });

  it('comes back to where it started when Reverses is set', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 0, true), {
        Position = Vector3.new(10, 0, 0)
      }):Play()
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.75);
    expect(node.position.x).toBeCloseTo(5, 4);

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(0, 4);
  });

  it('runs the whole tween RepeatCount extra times', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 1), {
        Position = Vector3.new(10, 0, 0)
      }):Play()
    `);
    expect(errors).toEqual([]);

    // Half way through the second pass: the value is on its way up again, not parked
    // at the end of the first.
    node.dispatchUpdate(0.75);
    expect(node.position.x).toBeCloseTo(5, 4);

    node.dispatchUpdate(0.4);
    expect(node.position.x).toBeCloseTo(10, 4);
  });
  describe('easing styles', () => {
  async function positionAt(style: string, step: number): Promise<{ x: number; errors: Array<{ message: string }> }> {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.${style}, Enum.EasingDirection.In), {
        Position = Vector3.new(10, 0, 0)
      }):Play()
    `);
    node.dispatchUpdate(step);
    return { x: node.position.x, errors };
  }

  it('gives every advertised style its own curve', async () => {
    // Quad In at the halfway mark is 0.25 of the way; if the other styles were
    // silently falling through to it they would all read 2.5.
    const quad = await positionAt('Quad', 0.5);
    const quart = await positionAt('Quart', 0.5);
    const quint = await positionAt('Quint', 0.5);
    const back = await positionAt('Back', 0.5);
    const bounce = await positionAt('Bounce', 0.5);

    expect(quad.x).toBeCloseTo(2.5, 3);
    expect(quart.x).toBeLessThan(quad.x);
    expect(quint.x).toBeLessThan(quart.x);
    // Back overshoots below the start on the way in, by design.
    expect(back.x).toBeLessThan(0);
    expect(bounce.x).not.toBeCloseTo(quad.x, 1);
  });

  it('lands exactly on the target whatever the curve', async () => {
    for (const style of ['Linear', 'Quad', 'Cubic', 'Quart', 'Quint', 'Back', 'Elastic', 'Bounce', 'Sine']) {
      const { x, errors } = await positionAt(style, 1);
      expect(errors, style).toEqual([]);
      expect(x, style).toBeCloseTo(10, 3);
    }
  });

  it('warns once about a style it does not have instead of quietly using Quad', async () => {
    const { node } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      for i = 1, 3 do
        TweenService:Create(part, TweenInfo.new(1, "Quadd", Enum.EasingDirection.In), {
          Position = Vector3.new(10, 0, 0)
        }):Play()
      end
    `);
    node.dispatchUpdate(0.5);
    const warnings = logs.filter((entry) => entry.level === 'warn' && entry.message.includes('Quadd'));
    expect(warnings).toHaveLength(1);
    // It still runs, on the fallback curve, rather than failing the script.
    expect(node.position.x).toBeCloseTo(2.5, 3);
  });
});
});
