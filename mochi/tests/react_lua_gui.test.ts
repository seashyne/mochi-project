// React over the GUI tree: elements in, nodes out, state re-renders.
//
// The tests pin the four things a component model has to get right - mount, patch
// without rebuilding, re-render on state, and teardown - rather than the syntax of any
// particular hook.

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

describe('React over the GUI tree', () => {
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

  function named(name: string) {
    const found = defaultGuiStore.roots().find((node) => node.name === name);
    expect(found, `no root GUI node named ${name}`).toBeDefined();
    return found!;
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

  it('mounts a component tree into PlayerGui', async () => {
    const { errors } = await run(`
      local App = function()
        return React.createElement("Frame", { Name = "Panel", Size = UDim2.new(0, 200, 0, 100) },
          React.createElement("TextLabel", { Name = "Title", Text = "Hello" })
        )
      end
      React.mount(React.createElement(App), player.PlayerGui)
    `);
    expect(errors).toEqual([]);

    const panel = named('Panel');
    expect(panel.size).toEqual({ xScale: 0, xOffset: 200, yScale: 0, yOffset: 100 });
    const title = defaultGuiStore.childOfClass(panel.id, 'TextLabel');
    expect(title?.text).toBe('Hello');
  });

  it('re-renders on state and keeps the same node', async () => {
    const { errors } = await run(`
      local Counter = function()
        local count, setCount = React.useState(0)
        return React.createElement("TextButton", {
          Name = "Button",
          Text = "Clicks: " .. count,
          MouseButton1Click = function() setCount(count + 1) end
        })
      end
      React.mount(React.createElement(Counter), player.PlayerGui)
    `);
    expect(errors).toEqual([]);

    const before = named('Button');
    expect(before.text).toBe('Clicks: 0');

    defaultGuiStore.fireClick(before.id);
    const after = named('Button');
    expect(after.id).toBe(before.id);
    expect(after.text).toBe('Clicks: 1');

    defaultGuiStore.fireClick(before.id);
    expect(named('Button').text).toBe('Clicks: 2');
  });

  it('patches a changed prop without rebuilding the node', async () => {
    const { errors } = await run(`
      local root = React.createRoot(player.PlayerGui)
      root:render(React.createElement("Frame", { Name = "Panel", BackgroundTransparency = 0.2 }))
      local first = player.PlayerGui:FindFirstChild("Panel")
      root:render(React.createElement("Frame", { Name = "Panel", BackgroundTransparency = 0.8 }))
      local second = player.PlayerGui:FindFirstChild("Panel")
      print(first == second and "same" or "replaced")
    `);
    expect(errors).toEqual([]);

    expect(named('Panel').backgroundTransparency).toBe(0.8);
    expect(logs.some((entry) => entry.message === 'same')).toBe(true);
  });

  it('runs an effect once per dependency change', async () => {
    const { errors } = await run(`
      local App = function()
        local count, setCount = React.useState(0)
        React.useEffect(function() print("effect " .. count) end, { count })
        return React.createElement("TextButton", {
          Name = "Button",
          Text = "x",
          MouseButton1Click = function() setCount(count + 1) end
        })
      end
      React.mount(React.createElement(App), player.PlayerGui)
    `);
    expect(errors).toEqual([]);
    expect(logs.filter((entry) => entry.message === 'effect 0')).toHaveLength(1);

    defaultGuiStore.fireClick(named('Button').id);
    expect(logs.filter((entry) => entry.message === 'effect 1')).toHaveLength(1);
    expect(logs.filter((entry) => entry.message === 'effect 0')).toHaveLength(1);
  });

  it('destroys the tree on unmount', async () => {
    const { errors } = await run(`
      local handle = React.mount(
        React.createElement("Frame", { Name = "Panel" }, React.createElement("TextLabel", { Name = "Title" })),
        player.PlayerGui
      )
      handle.unmount()
    `);
    expect(errors).toEqual([]);
    expect(defaultGuiStore.roots()).toHaveLength(0);
  });

  it('renders a plain string child as text', async () => {
    const { errors } = await run(`
      React.mount(React.createElement("TextLabel", { Name = "Title" }, "Score ", 42), player.PlayerGui)
    `);
    expect(errors).toEqual([]);
    expect(named('Title').text).toBe('Score 42');
  });

  it('reuses the root when mounting twice into the same parent', async () => {
    const { errors } = await run(`
      React.mount(React.createElement("Frame", { Name = "Panel" }), player.PlayerGui)
      React.mount(React.createElement("Frame", { Name = "Panel" }), player.PlayerGui)
    `);
    expect(errors).toEqual([]);
    expect(defaultGuiStore.roots()).toHaveLength(1);
  });
});
