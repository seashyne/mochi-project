// CFrame: the Lua value type and its bridge to a node transform.
//
// The type lives in the Lua prelude because `*` needs a metamethod. These tests cover
// both halves: the Euler/matrix round trip that keeps a script's CFrame and the
// collider agreeing, and real Lua running through a script context.

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
import { eulerFromMatrix, matrixMatchesEuler, rotationMatrix } from '../src/engine/runtime/cframeMath';

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

describe('euler and matrix', () => {
  const CASES: RuntimeVec3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 0.4, y: -1.1, z: 2.3 },
    { x: -1.5, y: 0.7, z: 0.2 },
    { x: Math.PI / 2, y: 0, z: 0 },
    { x: 0, y: Math.PI / 2, z: 0 },
    { x: 0, y: 0, z: -Math.PI / 3 }
  ];

  it('round-trips every axis through the matrix', () => {
    for (const rotation of CASES) {
      const matrix = rotationMatrix(rotation);
      const rebuilt = eulerFromMatrix(matrix);
      expect(matrixMatchesEuler(matrix, rebuilt)).toBe(true);
    }
  });

  it('folds the degenerate case at ninety degrees into one axis', () => {
    // cos(y) is zero here, so only x+z is recoverable. The matrix must still match.
    const rotation = { x: 0.3, y: Math.PI / 2, z: 0.6 };
    const matrix = rotationMatrix(rotation);
    const rebuilt = eulerFromMatrix(matrix);
    expect(rebuilt.z).toBe(0);
    expect(matrixMatchesEuler(matrix, rebuilt)).toBe(true);
  });
});

describe('CFrame in Lua', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

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
    const player = new StubPlayer();
    deps = {
      world,
      player,
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

  it('builds a CFrame and reads its position back', async () => {
    const { errors } = await run(`
      local cf = CFrame.new(3, 4, -5)
      print(cf.Position.x .. "," .. cf.Position.y .. "," .. cf.Position.z)
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message.includes('3,4,-5'))).toBe(true);
  });

  it('composes two CFrames with the multiplication operator', async () => {
    const { errors } = await run(`
      -- A quarter turn about Y maps -Z onto -X.
      local cf = CFrame.Angles(0, math.pi / 2, 0) * CFrame.new(0, 0, -1)
      print(string.format("%.3f,%.3f,%.3f", cf.Position.x, cf.Position.y, cf.Position.z))
    `);
    expect(errors).toEqual([]);
    const line = logs.find((entry) => entry.message.includes(','))?.message ?? '';
    expect(line).toContain('-1.000');
    expect(line).toContain('0.000');
  });

  it('writes a CFrame onto a part', async () => {
    const { node, errors } = await run(`
      script.parent.CFrame = CFrame.new(5, 1, -2)
    `);
    expect(errors).toEqual([]);
    expect(node.position.x).toBeCloseTo(5, 5);
    expect(node.position.y).toBeCloseTo(1, 5);
    expect(node.position.z).toBeCloseTo(-2, 5);
  });

  it('rotates a part by composing onto its own CFrame', async () => {
    const { node, errors } = await run(`
      script.parent.CFrame = CFrame.new(1, 0, 0)
      script.parent.CFrame = script.parent.CFrame * CFrame.Angles(0, math.pi / 2, 0)
    `);
    expect(errors).toEqual([]);
    // Position is untouched by a rotation about the part's own origin.
    expect(node.position.x).toBeCloseTo(1, 5);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2, 4);
  });

  it('exposes LookVector in the direction the engine calls forward', async () => {
    const { errors } = await run(`
      local cf = CFrame.Angles(0, math.pi / 2, 0)
      print(string.format("%.3f", cf.LookVector.x))
    `);
    expect(errors).toEqual([]);
    // Rotating +90 about Y turns -Z into -X.
    expect(logs.some((entry) => entry.message.includes('-1.000'))).toBe(true);
  });

  it('ignores a value that is not a CFrame', async () => {
    const { node, errors } = await run(`
      script.parent.CFrame = "not a cframe"
      script.parent.CFrame = 42
    `);
    expect(errors).toEqual([]);
    expect(node.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('runs the documented SCRIPTING.md example without errors', async () => {
    // Byte-for-byte the example in docs/SCRIPTING.md under "CFrame".
    const { node, errors } = await run(`
      local door = script.parent
      door.CFrame = CFrame.new(0, 3, 0) * CFrame.Angles(0, math.pi / 2, 0)
      print(door.CFrame.Position.x)
    `);
    expect(errors).toEqual([]);
    expect(node.position.y).toBeCloseTo(3, 5);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2, 4);
    expect(logs.some((entry) => entry.message === '0')).toBe(true);
  });

  it('inverts a transform back to the origin', async () => {
    const { errors } = await run(`
      local cf = CFrame.new(2, 3, 4) * CFrame.Angles(0.3, 0.4, 0.5)
      local back = cf:Inverse() * cf
      print(string.format("%.3f,%.3f,%.3f", back.Position.x, back.Position.y, back.Position.z))
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message.includes('0.000,0.000,0.000'))).toBe(true);
  });
});
