// `tick()` and `os.time()`: session time versus the wall clock.
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

describe('time globals', () => {
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
      getTime: () => 42.5
    };
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
  });

  it('tick() reports session time, not the wall clock', async () => {
    const { errors } = await run(`print(string.format("%.1f", tick()))`);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === '42.5')).toBe(true);
  });

  it('os.time() reports epoch seconds', async () => {
    const { errors } = await run(`
      local now = os.time()
      print(now > 1700000000 and "epoch" or "wrong")
    `);
    expect(errors).toEqual([]);
    expect(logs.some((entry) => entry.message === 'epoch')).toBe(true);
  });
});
