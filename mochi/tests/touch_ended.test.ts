// `TouchEnded`: the contact-edge event that pairs with `Touched`.
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
import { addTouchEndedHandler, emitTouchEnded, touchEndedHandlerCount } from '../src/engine/runtime/touchEnded';

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

describe('TouchEnded handlers', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  function makeNode(id = 'part_1'): LiveNode {
    const node = world.spawn(block(id));
    return node;
  }

  async function run(script: string, id = 'part_1') {
    const node = makeNode(id);
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

  it('connects from Lua through the node proxy', async () => {
    const { node, errors } = await run(`
      script.parent.TouchEnded:Connect(function(hit)
        print("ended " .. hit.Name)
      end)
    `);

    expect(errors).toEqual([]);
    expect(touchEndedHandlerCount(node)).toBe(1);

    emitTouchEnded(node, { Name: 'Tester' });
    expect(logs.some((entry) => entry.message === 'ended Tester')).toBe(true);
  });

  it('does not share handlers between nodes', async () => {
    const { node } = await run(`
      script.parent.TouchEnded:Connect(function() print("ended") end)
    `);
    const other = makeNode('part_2');

    emitTouchEnded(other, { Name: 'Tester' });
    expect(logs.some((entry) => entry.message === 'ended')).toBe(false);
    expect(touchEndedHandlerCount(node)).toBe(1);
    expect(touchEndedHandlerCount(other)).toBe(0);
  });

  it('keeps going when one handler throws, and reports it', () => {
    const node = makeNode();
    const reported: unknown[] = [];
    node.onError = (error) => reported.push(error);

    addTouchEndedHandler(node, () => {
      throw new Error('boom');
    });
    addTouchEndedHandler(node, () => logs.push({ level: 'info', message: 'second' }));

    emitTouchEnded(node, { Name: 'Tester' });

    expect(reported).toHaveLength(1);
    expect(logs.some((entry) => entry.message === 'second')).toBe(true);
  });

  it('does nothing when no handler is connected', () => {
    const node = makeNode();
    expect(touchEndedHandlerCount(node)).toBe(0);
    expect(() => emitTouchEnded(node, { Name: 'Tester' })).not.toThrow();
  });
});
