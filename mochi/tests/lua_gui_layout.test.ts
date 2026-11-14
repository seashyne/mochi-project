// The decoration classes: UICorner, UIPadding and UIListLayout.
//
// Split from `lua_gui_tree.test.ts` because they answer a different question - not
// "does the tree exist" but "does a child node change how its parent draws" - and
// because the tree suite was at the file-size ceiling.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { OBJECT_TYPE_DEFAULTS, StudioObject } from '../src/engine/studio/types';
import { AudioBus } from '../src/engine/runtime/audioBus';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';
import { defaultGuiStore } from '../src/engine/gui/guiStore';

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
  heal(amount: number): void { this.health = Math.min(100, this.health + amount); }
  setHealth(value: number): void { this.health = value; }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

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

describe('GUI decoration classes', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const node = world.spawn(block());
    const context = new ScriptContext({ node, code: script, deps });
    contexts.push(context);
    await context.start();
    return { errors: logs.filter((entry) => entry.level === 'error') };
  }

  beforeEach(() => {
    defaultGuiStore.reset();
    world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    state = new GameState();
    logs = [];
    contexts = [];
    deps = {
      world,
      player: new StubPlayer(),
      audio: { play: () => undefined, setListener: () => undefined, setMuted: () => undefined, isMuted: () => false } as unknown as AudioBus,
      state,
      log: (level, message) => logs.push({ level, message }),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0
    };
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
    defaultGuiStore.reset();
  });

  it('attaches a decoration node to its parent and keeps its properties', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      local corner = Instance.new("UICorner", frame)
      corner.CornerRadius = UDim.new(0, 12)
      local pad = Instance.new("UIPadding", frame)
      pad.PaddingTop = UDim.new(0, 8)
      pad.PaddingLeft = UDim.new(0, 4)
      local list = Instance.new("UIListLayout", frame)
      list.Padding = UDim.new(0, 6)
      list.FillDirection = Enum.FillDirection.Horizontal
      list.VerticalAlignment = Enum.VerticalAlignment.Center
    `);
    expect(errors).toEqual([]);

    const panel = defaultGuiStore.roots().find((node) => node.name === 'Panel');
    expect(panel).toBeDefined();
    const id = panel!.id;

    expect(defaultGuiStore.childOfClass(id, 'UICorner')?.cornerRadius).toEqual({ scale: 0, offset: 12 });
    expect(defaultGuiStore.childOfClass(id, 'UIPadding')?.paddingTop).toEqual({ scale: 0, offset: 8 });
    expect(defaultGuiStore.childOfClass(id, 'UIPadding')?.paddingLeft).toEqual({ scale: 0, offset: 4 });

    const list = defaultGuiStore.childOfClass(id, 'UIListLayout');
    expect(list?.listPadding).toEqual({ scale: 0, offset: 6 });
    expect(list?.fillDirection).toBe('Horizontal');
    expect(list?.listVAlign).toBe('Center');
  });

  it('leaves the layout enum comparable to its member', async () => {
    const { errors } = await run(`
      local list = Instance.new("UIListLayout", player.PlayerGui)
      print(tostring(list.FillDirection == Enum.FillDirection.Horizontal))
      list.FillDirection = "horizontal"
      print(tostring(list.FillDirection == Enum.FillDirection.Horizontal))
    `);
    expect(errors).toEqual([]);
    expect(logs.map((entry) => entry.message)).toEqual(['false', 'true']);
  });
});
