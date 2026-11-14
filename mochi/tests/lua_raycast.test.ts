// `world:Raycast`: line-of-sight, aiming and placement all start here, and nothing
// answered to it before - the physics world could cast a ray, scripts could not.

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

describe('world:Raycast', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  function block(id: string, y: number, extra: Partial<StudioObject> = {}): StudioObject {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    return {
      id,
      name: id,
      type: 'block',
      position: { x: 0, y, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale },
      color: defaults.defaultColor,
      anchored: true,
      canCollide: true,
      ...extra
    };
  }

  async function run(script: string, objects: StudioObject[] = []) {
    for (const object of objects) world.spawn(object);
    const node = world.spawn(block('caster', 20));
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

  it('finds the part under the ray and names it', async () => {
    const { errors } = await run(
      `
      local hit = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -10, 0))
      if hit == nil then
        print("miss")
      else
        print("hit:" .. hit.Instance.Name .. ":" .. string.format("%.2f", hit.Distance))
      end
    `,
      [block('floor', 0)]
    );
    expect(errors).toEqual([]);
    const line = logs.map((entry) => entry.message).find((message) => message.startsWith('hit:'));
    expect(line).toBeDefined();
    expect(line).toContain('hit:floor:');
  });

  it('returns the point and normal of the hit', async () => {
    const { errors } = await run(
      `
      local hit = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -10, 0))
      print(string.format("%.2f %.2f %.2f", hit.Position.x, hit.Position.y, hit.Normal.y))
    `,
      [block('floor', 0)]
    );
    expect(errors).toEqual([]);
    const [x, y, normalY] = (logs[0].message as string).split(' ').map(Number);
    expect(x).toBeCloseTo(0, 1);
    // The ray stops at the top face, not at the centre of the block.
    expect(y).toBeGreaterThan(0);
    expect(normalY).toBeCloseTo(1, 1);
  });

  it('misses when nothing is in the way', async () => {
    const { errors } = await run(`
      local hit = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, 10, 0))
      print(hit == nil and "miss" or "hit")
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'miss')).toBe(true);
  });

  it('stops at the reach the direction implies', async () => {
    const { errors } = await run(
      `
      local near = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -2, 0))
      local far = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -10, 0))
      print((near == nil and "near-miss" or "near-hit") .. " " .. (far == nil and "far-miss" or "far-hit"))
    `,
      [block('floor', 0)]
    );
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'near-miss far-hit')).toBe(true);
  });

  it('skips the part it was told to ignore', async () => {
    const { errors } = await run(
      `
      -- A part in the way, created by the script so it has a handle to ignore.
      local near = Instance.new("Part", nil, {
        Position = Vector3.new(0, 2, 0),
        Size = Vector3.new(4, 1, 4),
        Anchored = true
      })
      local blocked = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -10, 0))
      local skipped = world:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, -10, 0), near)
      print(blocked.Instance.Name .. " then " .. skipped.Instance.Name)
    `,
      [block('floor', 0)]
    );
    expect(errors).toEqual([]);
    // Without the ignore the near part blocks the ray; with it the ray reaches the
    // floor behind. That difference is the whole feature.
    const line = logs.map((entry) => entry.message).find((message) => message.includes(' then '));
    expect(line, `logs: ${JSON.stringify(logs)}`).toBeDefined();
    expect(line).not.toContain('floor then');
    expect(line).toContain('then floor');
  });
});
