// tween.PlaybackState, Pause/Resume and TweenService:GetValue. A script that starts a
// tween usually needs to know whether it is still running, and a boolean it set itself
// is not the same thing.

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

describe('tween playback state', () => {
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

  it('moves from Begin to Playing to Completed', async () => {
    const { node, errors } = await run(`
      local tween = TweenService:Create(script.parent, TweenInfo.new(1), {
        Position = Vector3.new(10, 0, 0)
      })
      print("before:" .. tostring(tween.PlaybackState))
      tween:Play()
      print("after:" .. tostring(tween.PlaybackState))
      tween.Completed:Connect(function()
        print("end:" .. tostring(tween.PlaybackState))
      end)
    `);
    expect(errors).toEqual([]);
    expect(logs[0].message).toBe('before:Begin');
    expect(logs[1].message).toBe('after:Playing');

    node.dispatchUpdate(1);
    expect(logs.some((entry) => entry.message === 'end:Completed')).toBe(true);
  });

  it('reports Cancelled and stops writing', async () => {
    const { node, errors } = await run(`
      local tween = TweenService:Create(script.parent, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0)
      })
      tween:Play()
      tween:Cancel()
      print(tostring(tween.PlaybackState))
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'Cancelled')).toBe(true);

    node.dispatchUpdate(1);
    expect(node.position.x).toBeCloseTo(0, 4);
  });

  it('holds still while paused', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      local tween = TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0)
      })
      tween:Play()
      local frames = 0
      RunService.Heartbeat:Connect(function()
        frames = frames + 1
        if frames == 2 then
          tween:Pause()
          print("paused:" .. tostring(tween.PlaybackState))
        end
      end)
    `);
    expect(errors).toEqual([]);

    node.dispatchUpdate(0.25);
    expect(node.position.x).toBeCloseTo(2.5, 3);

    // Second frame pauses. The driver runs before the handler that pauses, so the
    // position creeps by that frame's delta - what matters is that it stops there.
    node.dispatchUpdate(0.001);
    expect(logs.some((entry) => entry.message === 'paused:Paused')).toBe(true);
    const atPause = node.position.x;

    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(atPause, 6);
  });

  it('is Delayed while the delay runs, then starts moving', async () => {
    const { node, errors } = await run(`
      local tween = TweenService:Create(
        script.parent,
        TweenInfo.new(1, Enum.EasingStyle.Linear, nil, 0, false, 0.5),
        { Position = Vector3.new(10, 0, 0) }
      )
      tween:Play()
      print("state:" .. tostring(tween.PlaybackState))
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'state:Delayed')).toBe(true);

    node.dispatchUpdate(0.25);
    expect(node.position.x).toBeCloseTo(0, 3);

    node.dispatchUpdate(0.75);
    expect(node.position.x).toBeGreaterThan(0);
  });

  it('answers GetValue with the curve, clamped', async () => {
    const { errors } = await run(`
      print(string.format("%.3f", TweenService:GetValue(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)))
      print(string.format("%.3f", TweenService:GetValue(2, Enum.EasingStyle.Linear)))
      print(string.format("%.3f", TweenService:GetValue(-1, Enum.EasingStyle.Linear)))
    `);
    expect(errors).toEqual([]);
    const values = logs.map((entry) => entry.message);
    expect(values[0]).toBe('0.750');
    expect(values[1]).toBe('1.000');
    expect(values[2]).toBe('0.000');
  });

  it('cancels an older tween that touches the same property', async () => {
    const { node, errors } = await run(`
      local part = script.parent
      part.Position = Vector3.new(0, 0, 0)
      local first = TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(10, 0, 0)
      })
      first:Play()
      local second = TweenService:Create(part, TweenInfo.new(1, Enum.EasingStyle.Linear), {
        Position = Vector3.new(-10, 0, 0)
      })
      second:Play()
      print(first.PlaybackState .. " " .. second.PlaybackState)
    `);
    expect(errors).toEqual([]);
    // Two tweens on one property would otherwise fight and land on neither target.
    expect(logs.some((entry) => entry.message === 'Cancelled Playing')).toBe(true);

    node.dispatchUpdate(1);
    expect(node.position.x).toBeCloseTo(-10, 3);
  });

  it('leaves a tween alone when the properties do not overlap', async () => {
    const { errors } = await run(`
      local part = script.parent
      local first = TweenService:Create(part, TweenInfo.new(1), { Position = Vector3.new(10, 0, 0) })
      first:Play()
      local second = TweenService:Create(part, TweenInfo.new(1), { Color = Color3.new(1, 0, 0) })
      second:Play()
      print(first.PlaybackState)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'Playing')).toBe(true);
  });

  it('damps a number toward its target without overshooting', async () => {
    const { errors } = await run(`
      local value, velocity = 0, 0
      local peak = 0
      for frame = 1, 120 do
        value, velocity = TweenService:SmoothDamp(value, 10, velocity, 0.2, nil, 1 / 60)
        if value > peak then peak = value end
      end
      print(string.format("%.2f %.2f", value, peak))
    `);
    expect(errors).toEqual([]);
    const [settled, peak] = (logs[0].message as string).split(' ').map(Number);
    expect(settled).toBeCloseTo(10, 1);
    // A critically damped spring may not pass the target on the way.
    expect(peak).toBeLessThanOrEqual(10.0001);
  });

  it('damps a Vector3 component by component', async () => {
    const { errors } = await run(`
      local value, velocity = Vector3.new(0, 0, 0), Vector3.new(0, 0, 0)
      for frame = 1, 120 do
        value, velocity = TweenService:SmoothDamp(value, Vector3.new(4, 8, -2), velocity, 0.15, nil, 1 / 60)
      end
      print(string.format("%.1f %.1f %.1f", value.x, value.y, value.z))
    `);
    expect(errors).toEqual([]);
    const parts = (logs[0].message as string).split(' ').map(Number);
    expect(parts[0]).toBeCloseTo(4, 0);
    expect(parts[1]).toBeCloseTo(8, 0);
    expect(parts[2]).toBeCloseTo(-2, 0);
  });

  it('damps a CFrame in position and rotation together', async () => {
    const { errors } = await run(`
      local target = CFrame.new(10, 0, 0) * CFrame.Angles(0, math.pi / 2, 0)
      local frame = CFrame.new(0, 0, 0)
      local velocity = nil
      local peak = 0
      for step = 1, 200 do
        frame, velocity = TweenService:SmoothDamp(frame, target, velocity, 0.2, nil, 1 / 60)
        if frame.x > peak then peak = frame.x end
      end
      print(string.format("%.2f %.2f %.2f %s", frame.x, frame.m22, peak, type(velocity.Angular)))
    `);
    expect(errors).toEqual([]);
    const [x, m22, peak, angularType] = (logs[0].message as string).split(' ');
    expect(Number(x)).toBeCloseTo(10, 1);
    // A quarter turn about Y leaves the third column pointing along -X, so m22 is zero.
    expect(Number(m22)).toBeCloseTo(0, 1);
    expect(Number(peak)).toBeLessThanOrEqual(10.0001);
    expect(angularType).toBe('number');
  });
});
