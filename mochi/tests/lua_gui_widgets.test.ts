// The rest of the GUI surface from a script's point of view: images, the grid and
// scale decorations, the text properties, and TweenService.
//
// The tween test drives the clock directly (`advanceTweens`) because there is no
// animation frame in this environment - the same function the browser loop calls.

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

describe('GUI widgets', () => {
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
    return { errors: logs.filter((entry) => entry.level === 'error'), node };
  }

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

  it('carries an image and how it fills the box', async () => {
    const { errors } = await run(`
      local icon = Instance.new("ImageLabel", player.PlayerGui)
      icon.Name = "Icon"
      icon.Image = "https://cdn.example.com/icon.png"
      icon.ScaleType = Enum.ScaleType.Crop
      icon.ImageColor3 = Color3.fromRGB(255, 128, 0)
    `);
    expect(errors).toEqual([]);

    const icon = byName('Icon');
    expect(icon.image).toBe('https://cdn.example.com/icon.png');
    expect(icon.imageScaleType).toBe('Crop');
    expect(icon.imageColor).toBe('#ff8000');
  });

  it('carries a grid cell size and padding', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      local grid = Instance.new("UIGridLayout", frame)
      grid.CellSize = UDim2.new(0, 64, 0, 64)
      grid.CellPadding = UDim2.new(0, 4, 0, 8)
    `);
    expect(errors).toEqual([]);

    const grid = defaultGuiStore.childOfClass(byName('Panel').id, 'UIGridLayout');
    expect(grid?.cellSize).toEqual({ xScale: 0, xOffset: 64, yScale: 0, yOffset: 64 });
    expect(grid?.cellPadding).toEqual({ xScale: 0, xOffset: 4, yScale: 0, yOffset: 8 });
  });

  it('carries a scale and an aspect ratio', async () => {
    const { errors } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      local scale = Instance.new("UIScale", frame)
      scale.Scale = 1.5
      local aspect = Instance.new("UIAspectRatioConstraint", frame)
      aspect.AspectRatio = 1.7778
      aspect.DominantAxis = Enum.DominantAxis.Height
    `);
    expect(errors).toEqual([]);

    const id = byName('Panel').id;
    expect(defaultGuiStore.childOfClass(id, 'UIScale')?.scale).toBe(1.5);
    expect(defaultGuiStore.childOfClass(id, 'UIAspectRatioConstraint')?.aspectRatio).toBeCloseTo(1.7778, 4);
    expect(defaultGuiStore.childOfClass(id, 'UIAspectRatioConstraint')?.aspectAxis).toBe('Height');
  });

  it('carries the text layout switches', async () => {
    const { errors } = await run(`
      local label = Instance.new("TextLabel", player.PlayerGui)
      label.Name = "Caption"
      label.TextScaled = true
      label.TextWrapped = true
      label.ClipsDescendants = false
      label.LayoutOrder = 3
    `);
    expect(errors).toEqual([]);

    const caption = byName('Caption');
    expect(caption.textScaled).toBe(true);
    expect(caption.textWrapped).toBe(true);
    expect(caption.clipsDescendants).toBe(false);
    expect(caption.layoutOrder).toBe(3);
  });

  it('animates a GUI property and fires Completed as a signal', async () => {
    const { errors, node } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      local tween = TweenService:Create(frame, TweenInfo.new(0.2, Enum.EasingStyle.Linear), {
        BackgroundTransparency = 1
      })
      tween.Completed:Connect(function() print("done") end)
      tween:Play()
    `);
    expect(errors).toEqual([]);

    // The service drives tweens from the node's update event, so the test drives the
    // same event the runtime does.
    node.dispatchUpdate(0.1);
    expect(byName('Panel').backgroundTransparency).toBeCloseTo(0.5, 2);

    node.dispatchUpdate(0.15);
    expect(byName('Panel').backgroundTransparency).toBe(1);
    expect(logs.some((entry) => entry.message === 'done')).toBe(true);
  });

  it('leaves an unknown tween property alone instead of failing', async () => {
    const { errors, node } = await run(`
      local frame = Instance.new("Frame", player.PlayerGui)
      frame.Name = "Panel"
      TweenService:Create(frame, TweenInfo.new(0.1), { Nonsense = 1 }):Play()
      print("survived")
    `);
    expect(errors).toEqual([]);
    node.dispatchUpdate(0.2);
    expect(logs.some((entry) => entry.message === 'survived')).toBe(true);
    expect(byName('Panel').backgroundTransparency).toBe(0);
  });
});
