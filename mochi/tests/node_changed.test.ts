// `Changed` and `GetPropertyChangedSignal`: property-change events on a node.
//
// The handler list lives in a side table rather than on the node, so these tests also
// pin the two properties that matter: handlers are per node, and one throwing handler
// does not stop the next.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { OBJECT_TYPE_DEFAULTS, StudioObject } from '../src/engine/studio/types';
import { AudioBus } from '../src/engine/runtime/audioBus';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { RuntimePlayerHandle } from '../src/engine/runtime/types';
import { LiveNode } from '../src/engine/runtime/liveNode';
import { connectChanged, emitChanged } from '../src/engine/runtime/nodeChanged';

class StubPlayer implements RuntimePlayerHandle {
  readonly id = 'player_local';
  readonly name = 'Tester';
  position = { x: 0, y: 2, z: 0 };
  getPosition() { return this.position; }
  setPosition(x: number, y: number, z: number) { this.position = { x, y, z }; }
  setVelocity() { /* unused */ }
  applyImpulse() { /* unused */ }
  respawn() { /* unused */ }
  damage() { /* unused */ }
  heal() { /* unused */ }
  setHealth() { /* unused */ }
  getHealth() { return 100; }
  getMaxHealth() { return 100; }
}

function block(id = 'part_1'): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS.block;
  return {
    id,
    name: id,
    type: 'block',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { ...defaults.defaultScale },
    color: defaults.defaultColor,
    anchored: true
  };
}

describe('Changed handlers', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  function makeNode(id = 'part_1'): LiveNode {
    return world.spawn(block(id));
  }

  async function run(script: string) {
    const node = makeNode();
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
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
  });

  it('reports the property name to a general listener', async () => {
    const { errors } = await run(`
      script.parent.Changed:Connect(function(property)
        print("changed " .. property)
      end)
      script.parent.Color = "#ff0000"
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'changed Color')).toBe(true);
  });

  it('only fires the matching property signal', async () => {
    const { errors } = await run(`
      local part = script.parent
      part:GetPropertyChangedSignal("Position"):Connect(function()
        print("moved")
      end)
      part.Color = "#00ff00"
      part.Position = Vector3.new(1, 2, 3)
    `);
    expect(errors).toEqual([]);
    expect(logs.filter((entry) => entry.message === 'moved')).toHaveLength(1);
  });

  it('matches the property name exactly', async () => {
    const { node } = await run(`
      script.parent:GetPropertyChangedSignal("position"):Connect(function()
        print("lower")
      end)
    `);
    emitChanged(node, 'Position');
    expect(logs.some((entry) => entry.message === 'lower')).toBe(false);
  });

  it('keeps going when one listener throws', () => {
    const node = makeNode();
    const reported: unknown[] = [];
    node.onError = (error) => reported.push(error);
    connectChanged(node, 'Color', () => {
      throw new Error('boom');
    });
    connectChanged(node, 'Color', () => logs.push({ level: 'info', message: 'second' }));

    emitChanged(node, 'Color');

    expect(reported).toHaveLength(1);
    expect(logs.some((entry) => entry.message === 'second')).toBe(true);
  });

  it('does nothing when no listener is connected', () => {
    const node = makeNode();
    expect(() => emitChanged(node, 'Color')).not.toThrow();
  });
});
