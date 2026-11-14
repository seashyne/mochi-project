// `IsA` and the child finders. `IsA` used to compare the object's raw type against the
// name, so `part:IsA("Part")` was false for a block - and a ported script that guards
// with `if child:IsA("BasePart")` silently skipped every part in the world.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { OBJECT_TYPE_DEFAULTS, StudioObject, StudioObjectType } from '../src/engine/studio/types';
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

describe('IsA and child lookup', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  function object(id: string, type: StudioObjectType, extra: Partial<StudioObject> = {}): StudioObject {
    const defaults = OBJECT_TYPE_DEFAULTS[type] ?? OBJECT_TYPE_DEFAULTS.block;
    return {
      id,
      name: id,
      type,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale },
      color: defaults.defaultColor,
      anchored: true,
      ...extra
    };
  }

  async function run(script: string, objects: StudioObject[] = []) {
    // The runner comes first so anything declaring `parentId: 'runner'` has somewhere to
    // attach - the registry links on spawn, not at the end.
    const node = world.spawn(object('runner', 'block'));
    for (const item of objects) world.spawn(item);
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

  it('answers the class a part really is, and the ones it inherits', async () => {
    const { errors } = await run(`
      local part = script.parent
      print(table.concat({
        tostring(part:IsA("Part")),
        tostring(part:IsA("BasePart")),
        tostring(part:IsA("Instance")),
        tostring(part:IsA("Model"))
      }, " "))
    `);
    expect(errors).toEqual([]);
    expect(logs[0].message).toBe('true true true false');
  });

  it('treats an agent as a model', async () => {
    const { errors } = await run(
      `
      local npc = script.parent:FindFirstChild("npc")
      print(tostring(npc:IsA("Model")) .. " " .. tostring(npc:IsA("Part")))
    `,
      [object('npc', 'agent', { parentId: 'runner' })]
    );
    expect(errors).toEqual([]);
    expect(logs[0].message).toBe('true false');
  });

  it('finds a grandchild only when asked to search descendants', async () => {
    const { errors } = await run(
      `
      local root = script.parent
      local shallow = root:FindFirstChild("deep")
      local deep = root:FindFirstChild("deep", true)
      print((shallow == nil and "nil" or "found") .. " " .. (deep == nil and "nil" or deep.Name))
    `,
      [
        object('model', 'model', { parentId: 'runner' }),
        object('child', 'block', { parentId: 'model' }),
        object('deep', 'block', { parentId: 'child' })
      ]
    );
    expect(errors).toEqual([]);
    expect(logs[0].message).toBe('nil deep');
  });

  it('finds the first child of a class', async () => {
    const { errors } = await run(
      `
      local found = script.parent:FindFirstChildOfClass("Part")
      print(found == nil and "nil" or found.Name)
    `,
      [object('crate', 'block', { parentId: 'runner' })]
    );
    expect(errors).toEqual([]);
    expect(logs[0].message).toBe('crate');
  });
});
