// `player.Character.Humanoid`: the shape avatar scripts reach for.
//
// The controller is not an Instance tree, so this is a table with the same property
// names rather than a parented instance. The tests pin the two things that make the
// difference invisible in practice: `WalkSpeed` really drives the walk, and both the
// colon and dot call forms work.

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
  respawn(): void { this.health = 100; }
  damage(amount: number): void { this.health = Math.max(0, this.health - amount); }
  heal(amount: number): void { this.health += amount; }
  setHealth(value: number): void { this.health = value; }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
  jumpVelocity = 9;
  jumps = 0;
  getJumpVelocity(): number { return this.jumpVelocity; }
  setJumpVelocity(value: number): void { this.jumpVelocity = value; }
  jump(): void { this.jumps += 1; }
}

describe('player.Character.Humanoid', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];
  let moves: Array<{ x: number; z: number; speed?: number }>;
  let player: StubPlayer;

  function block(): StudioObject {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    return {
      id: 'part_1',
      name: 'Part_1',
      type: 'block',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale },
      color: defaults.defaultColor,
      anchored: true
    };
  }

  function poll(): void {
    (deps.playerApi as unknown as { pollSignals?: () => void } | undefined)?.pollSignals?.();
  }

  async function run(script: string) {
    const node = world.spawn(block());
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
    moves = [];
    player = new StubPlayer();
    deps = {
      world,
      player,
      audio: { play: vi.fn(), setListener: () => undefined, setMuted: () => undefined, isMuted: () => false } as unknown as AudioBus,
      state,
      log: (level, message) => logs.push({ level, message }),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0,
      navigation: {
        moveTo: (x: number, z: number, speed?: number) => {
          moves.push({ x, z, speed });
          return true;
        },
        stop: () => undefined,
        isMoving: () => false,
        grid: () => null as never
      }
    };
    deps.playerApi = createPlayerApi(deps);
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
  });

  it('exposes the default walk speed', async () => {
    const { errors } = await run(`
      print(player.Character.Humanoid.WalkSpeed)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === '4')).toBe(true);
  });

  it('walks to a Vector3 with the configured walk speed', async () => {
    const { errors } = await run(`
      local humanoid = player.Character.Humanoid
      humanoid.WalkSpeed = 12
      humanoid:MoveTo(Vector3.new(10, 0, -4))
    `);
    expect(errors).toEqual([]);
    expect(moves).toEqual([{ x: 10, z: -4, speed: 12 }]);
  });

  it('accepts the three-number form and a dot call', async () => {
    const { errors } = await run(`
      player.Character.Humanoid.MoveTo(3, 0, 7)
    `);
    expect(errors).toEqual([]);
    expect(moves).toEqual([{ x: 3, z: 7, speed: 4 }]);
  });

  it('ignores a walk speed that is not a positive number', async () => {
    const { errors } = await run(`
      local humanoid = player.Character.Humanoid
      humanoid.WalkSpeed = -5
      humanoid.WalkSpeed = "fast"
      print(humanoid.WalkSpeed)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === '4')).toBe(true);
  });

  it('shares health with the player', async () => {
    const { errors } = await run(`
      local humanoid = player.Character.Humanoid
      humanoid:TakeDamage(30)
      print(humanoid.Health .. "/" .. humanoid.MaxHealth)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === '70/100')).toBe(true);
  });

  it('fires Died once when health reaches zero', async () => {
    const { errors } = await run(`
      player.Character.Humanoid.Died:Connect(function()
        print("died")
      end)
    `);
    expect(errors).toEqual([]);

    deps.player.damage(200);
    poll();
    poll();

    expect(logs.filter((entry) => entry.message === 'died')).toHaveLength(1);
  });

  it('fires CharacterAdded after a respawn', async () => {
    const { errors } = await run(`
      local humanoid = player.Character.Humanoid
      humanoid.Died:Connect(function() print("died") end)
      player.CharacterAdded:Connect(function() print("spawned") end)
    `);
    expect(errors).toEqual([]);

    deps.player.damage(200);
    poll();
    deps.player.setHealth(100);
    poll();

    expect(logs.filter((entry) => entry.message === 'died')).toHaveLength(1);
    expect(logs.filter((entry) => entry.message === 'spawned')).toHaveLength(1);
  });

  it('stops firing after the connection is disconnected', async () => {
    const { errors } = await run(`
      local connection = player.Character.Humanoid.Died:Connect(function() print("died") end)
      connection:Disconnect()
    `);
    expect(errors).toEqual([]);

    deps.player.damage(200);
    poll();

    expect(logs.filter((entry) => entry.message === 'died')).toHaveLength(0);
  });

  it('mirrors the player position on the character', async () => {
    const { errors } = await run(`
      player.Character.Position = Vector3.new(5, 3, -2)
      print(player.Character.Position.x)
    `);
    expect(errors).toEqual([]);
    expect(deps.player.getPosition()).toEqual({ x: 5, y: 3, z: -2 });
    expect(logs.some((entry) => entry.message === '5')).toBe(true);
  });

  it('maps JumpPower onto the launch velocity', async () => {
    const { errors } = await run(`
      player.Character.Humanoid.JumpPower = 100
      print(string.format("%.1f", player.Character.Humanoid.JumpPower))
    `);
    expect(errors).toEqual([]);
    // 50 is the default a ported script expects and it maps onto 9 m/s, so 100 doubles it.
    expect(player.jumpVelocity).toBeCloseTo(18, 5);
    expect(logs.some((entry) => entry.message === '100.0')).toBe(true);
  });

  it('queues a jump when Jump is set', async () => {
    const { errors } = await run(`player.Character.Humanoid.Jump = true`);
    expect(errors).toEqual([]);
    expect(player.jumps).toBe(1);
  });

  it('ignores a jump power that is not a positive number', async () => {
    const { errors } = await run(`player.Character.Humanoid.JumpPower = -5`);
    expect(errors).toEqual([]);
    expect(player.jumpVelocity).toBe(9);
  });
});
