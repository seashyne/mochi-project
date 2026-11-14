// The GUI tree a ported interface builds: ScreenGui, Frame, TextLabel, TextButton.
//
// The tests pin the parts a script would notice: a GUI class does not spawn a world
// node, UDim2 and Color3 survive the boundary, parenting is a tree, and a button's
// click reaches Lua.

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

describe('GUI tree', () => {
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
    // The count is taken after the script's own part exists, so a GUI class that
    // wrongly spawned one would show up as an extra node.
    return { errors: logs.filter((entry) => entry.level === 'error'), worldCount: world.getAll().length };
  }

  /** The node a script created, looked up by name in the PlayerGui tree. */
  function byName(name: string) {
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

  it('builds a ScreenGui without spawning a world node', async () => {
    const { errors, worldCount } = await run(`
      local gui = Instance.new("ScreenGui")
      gui.Name = "Hud"
      gui.Parent = player.PlayerGui
    `);
    expect(errors).toEqual([]);
    // Only the script's own part: a ScreenGui belongs to the interface tree.
    expect(worldCount).toBe(1);
    expect(byName('Hud').className).toBe('ScreenGui');
  });

  it('nests a label inside a frame inside the screen', async () => {
    const { errors } = await run(`
      local screen = Instance.new("ScreenGui", player.PlayerGui)
      screen.Name = "Screen"
      local frame = Instance.new("Frame", screen)
      frame.Name = "Panel"
      local label = Instance.new("TextLabel", frame)
      label.Name = "Title"
      label.Text = "Hello"
    `);
    expect(errors).toEqual([]);

    const screen = byName('Screen');
    const frame = defaultGuiStore.childrenOf(screen.id)[0];
    const label = defaultGuiStore.childrenOf(frame.id)[0];
    expect(frame.name).toBe('Panel');
    expect(label.name).toBe('Title');
    expect(label.text).toBe('Hello');
  });

  it('keeps UDim2 scale and offset separate', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Box"
      frame.Size = UDim2.new(0, 200, 0.5, -10)
      frame.Position = UDim2.fromScale(0.25, 0)
    `);
    expect(errors).toEqual([]);

    const box = byName('Box');
    expect(box.size).toEqual({ xScale: 0, xOffset: 200, yScale: 0.5, yOffset: -10 });
    expect(box.position).toEqual({ xScale: 0.25, xOffset: 0, yScale: 0, yOffset: 0 });
  });

  it('converts Color3.fromRGB and stores the enum name, not an internal family', async () => {
    const { errors } = await run(`
      local label = Instance.new("TextLabel", player.PlayerGui)
      label.Name = "Caption"
      label.TextColor3 = Color3.fromRGB(255, 0, 0)
      label.TextSize = 24
      label.Font = Enum.Font.Code
      label.TextXAlignment = Enum.TextXAlignment.Left
    `);
    expect(errors).toEqual([]);

    const caption = byName('Caption');
    expect(caption.textColor).toBe('#ff0000');
    expect(caption.textSize).toBe(24);
    expect(caption.font).toBe('Code');
    expect(caption.xAlign).toBe('Left');
  });

  it('compares equal to the enum member it was set from', async () => {
    const { errors } = await run(`
      local label = Instance.new("TextLabel", player.PlayerGui)
      label.Font = Enum.Font.GothamBold
      label.TextXAlignment = Enum.TextXAlignment.Right
      label.TextYAlignment = Enum.TextYAlignment.Top
      print(tostring(label.Font == Enum.Font.GothamBold))
      print(tostring(label.TextXAlignment == Enum.TextXAlignment.Right))
      print(tostring(label.TextYAlignment == Enum.TextYAlignment.Top))
    `);
    expect(errors).toEqual([]);
    expect(logs.map((entry) => entry.message)).toEqual(['true', 'true', 'true']);
  });

  it('accepts a bare string in any casing', async () => {
    const { errors } = await run(`
      local label = Instance.new("TextLabel", player.PlayerGui)
      label.Name = "Caption"
      label.Font = "roboto mono"
      label.TextXAlignment = "right"
    `);
    expect(errors).toEqual([]);

    const caption = byName('Caption');
    expect(caption.font).toBe('RobotoMono');
    expect(caption.xAlign).toBe('Right');
  });

  it('keeps the previous value when the name is unknown', async () => {
    const { errors } = await run(`
      local label = Instance.new("TextLabel", player.PlayerGui)
      label.Name = "Caption"
      label.Font = "ComicPapyrus"
    `);
    expect(errors).toEqual([]);
    expect(byName('Caption').font).toBe('SourceSans');
  });

  it('destroys children with their parent', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      local child = Instance.new("TextLabel", frame)
      child.Name = "Inner"
      frame:Destroy()
    `);
    expect(errors).toEqual([]);
    expect(defaultGuiStore.roots()).toHaveLength(0);
  });

  it('fires a button click through the store', async () => {
    const { errors } = await run(`
      local button = Instance.new("TextButton", player.PlayerGui)
      button.Name = "Play"
      button.MouseButton1Click:Connect(function() print("clicked") end)
    `);
    expect(errors).toEqual([]);

    defaultGuiStore.fireClick(byName('Play').id);
    expect(logs.filter((entry) => entry.message === 'clicked')).toHaveLength(1);
  });

  it('returns the same proxy from FindFirstChild', async () => {
    const { errors } = await run(`
      local screen = Instance.new("ScreenGui", player.PlayerGui)
      screen.Name = "Screen"
      local label = Instance.new("TextLabel", screen)
      label.Name = "Title"
      local same = screen:FindFirstChild("Title")
      print(same == label and "same" or "different")
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'same')).toBe(true);
  });

  it('refuses to make a node its own ancestor', async () => {
    const { errors } = await run(`
      local outer = Instance.new("Frame", player.PlayerGui)
      outer.Name = "Outer"
      local inner = Instance.new("Frame", outer)
      inner.Name = "Inner"
      outer.Parent = inner
    `);
    expect(errors).toEqual([]);

    const outer = byName('Outer');
    expect(outer.parentId).toBe(defaultGuiStore.playerGuiId);
  });

  it('still spawns a world node for a non-GUI class', async () => {
    const { errors, worldCount } = await run(`
      local part = Instance.new("Part")
      part.Name = "Crate"
    `);
    expect(errors).toEqual([]);
    expect(worldCount).toBe(2);
  });

  it('does not draw a node that was never parented', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame")
      frame.Name = "Loose"
    `);
    expect(errors).toEqual([]);
    // Built but not placed: nothing on screen, which is what the source API does.
    expect(defaultGuiStore.roots()).toHaveLength(0);
  });

  it('detaches on Parent = nil instead of moving to the root', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      frame.Parent = nil
    `);
    expect(errors).toEqual([]);
    expect(defaultGuiStore.roots()).toHaveLength(0);
  });
});
