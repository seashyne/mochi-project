// Lua `animation.*` bindings: the globals layer that lets a world script drive
// the animation state graph, including a real Lua run through ScriptContext.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { createAnimationApi } from '../src/engine/runtime/luaGlobals';
import type { AnimationBridge, RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import { OBJECT_TYPE_DEFAULTS, StudioObject } from '../src/engine/studio/types';

function makeBridge(overrides: Partial<AnimationBridge> = {}): AnimationBridge & {
  calls: Array<[string, string, unknown]>;
  state: string | null;
} {
  const calls: Array<[string, string, unknown]> = [];
  const bridge = {
    calls,
    state: 'idle' as string | null,
    setParameter: (name: string, value: boolean | number) => { calls.push(['set', name, value]); },
    trigger: (name: string) => { calls.push(['trigger', name, undefined]); },
    getState: () => bridge.state,
    ...overrides
  };
  return bridge;
}

function makeDeps(bridge?: AnimationBridge): { deps: RuntimeApiDeps; world: RuntimeWorld; state: GameState; logs: string[] } {
  const world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
  const state = new GameState();
  const logs: string[] = [];
  const deps: RuntimeApiDeps = {
    world,
    player: { getPosition: () => ({ x: 0, y: 0, z: 0 }) } as never,
    audio: { play: () => undefined } as never,
    state,
    log: (_level, message) => logs.push(message),
    setSpawnPoint: () => undefined,
    getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
    getTime: () => 0,
    animation: bridge
  };
  return { deps, world, state, logs };
}

function makeNode(): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS.block;
  return {
    id: 'scripted',
    name: 'Scripted',
    type: 'block',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { ...defaults.defaultScale },
    color: defaults.defaultColor,
    anchored: true,
    canCollide: false,
    luaScript: ''
  };
}

describe('createAnimationApi', () => {
  it('forwards boolean and numeric parameters', () => {
    const bridge = makeBridge();
    const api = createAnimationApi(makeDeps(bridge).deps);

    api.setBool('walking', true);
    api.setNumber('speed', 2.5);
    api.setParameter('walking', false);
    api.setParameter('speed', 4);

    expect(bridge.calls).toEqual([
      ['set', 'walking', true],
      ['set', 'speed', 2.5],
      ['set', 'walking', false],
      ['set', 'speed', 4]
    ]);
  });

  it('fires triggers and reads state', () => {
    const bridge = makeBridge();
    const api = createAnimationApi(makeDeps(bridge).deps);

    api.trigger('jump');
    expect(bridge.calls).toEqual([['trigger', 'jump', undefined]]);
    expect(api.getState()).toBe('idle');

    bridge.state = null;
    expect(api.getState()).toBe('');
  });

  it('is a no-op without a bridge', () => {
    const api = createAnimationApi(makeDeps().deps);
    expect(() => {
      api.setBool('a', true);
      api.setNumber('b', 1);
      api.trigger('c');
    }).not.toThrow();
    expect(api.getState()).toBe('');
  });

  it('rejects non-finite numbers', () => {
    const bridge = makeBridge();
    const api = createAnimationApi(makeDeps(bridge).deps);
    api.setNumber('speed', Number.NaN);
    api.setNumber('speed', 'abc');
    expect(bridge.calls).toEqual([]);
  });

  it('coerces a non-number value to boolean on setParameter', () => {
    const bridge = makeBridge();
    const api = createAnimationApi(makeDeps(bridge).deps);
    api.setParameter('walking', 'yes');
    expect(bridge.calls).toEqual([['set', 'walking', true]]);
  });
});

describe('Lua animation globals', () => {
  async function runScript(code: string, bridge?: AnimationBridge) {
    const { deps, world, state, logs } = makeDeps(bridge);
    const node = world.spawn(makeNode());
    const context = new ScriptContext({ node, code, deps });
    await context.start();
    context.dispose();
    world.clear();
    state.dispose();
    return { logs, world };
  }

  it('drives parameters and triggers from Lua', async () => {
    const bridge = makeBridge();
    const { logs } = await runScript(
      [
        'animation.setParameter("walking", true)',
        'animation.setNumber("speed", 3)',
        'animation.trigger("jump")'
      ].join('\n'),
      bridge
    );

    expect(logs.filter((entry) => entry.includes('Script error'))).toEqual([]);
    expect(bridge.calls).toEqual([
      ['set', 'walking', true],
      ['set', 'speed', 3],
      ['trigger', 'jump', undefined]
    ]);
  });

  it('reads the current state from Lua', async () => {
    const bridge = makeBridge();
    bridge.state = 'walk';
    const { logs } = await runScript('print("state:" .. animation.getState())', bridge);
    expect(logs).toContain('state:walk');
  });

  it('runs the documented RUNTIME.md example without errors', async () => {
    const bridge = makeBridge();
    const { logs } = await runScript([
      'script.onUpdate.Connect(function(dt)',
      '    local speed = player.getScore("Speed")',
      '    animation.setNumber("speed", speed)',
      '    animation.setBool("walking", speed > 0.5)',
      'end)',
      'animation.trigger("jump")'
    ].join('\n'), bridge);

    expect(logs.filter((entry) => entry.includes('Script error'))).toEqual([]);
    expect(bridge.calls).toEqual([['trigger', 'jump', undefined]]);
  });

  it('reports an empty state when the world has no graph', async () => {
    const { logs } = await runScript('print("state:[" .. animation.getState() .. "]")');
    expect(logs).toContain('state:[]');
  });
});
