// `task.wait` must suspend the script and let the host resume it later. These tests
// drive the scheduler directly with a fake clock, so nothing depends on wall time.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import type { RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import { OBJECT_TYPE_DEFAULTS, type StudioObject } from '../src/engine/studio/types';

interface LogEntry {
  level: string;
  message: string;
  line?: number;
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

function harness(code: string) {
  const world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
  const state = new GameState();
  const logs: LogEntry[] = [];
  let now = 0;

  const deps: RuntimeApiDeps = {
    world,
    player: { getPosition: () => ({ x: 0, y: 0, z: 0 }) } as never,
    audio: { play: () => undefined } as never,
    state,
    log: (level, message, _source, meta) => {
      logs.push({ level, message, line: (meta as { line?: number } | undefined)?.line });
    },
    setSpawnPoint: () => undefined,
    getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
    getTime: () => now
  };

  const node = world.spawn(makeNode());
  // The runtime wires this to the session console; the harness collects it.
  node.onError = (error: unknown) => {
    logs.push({ level: 'error', message: error instanceof Error ? error.message : String(error) });
  };
  const context = new ScriptContext({ node, code, deps });

  return {
    node,
    context,
    logs,
    /** Advances the fake clock, then gives the scheduler a frame. */
    frame(dt: number) {
      now += dt;
      context.advance();
    },
    printed() {
      return logs.filter((entry) => entry.level === 'info').map((entry) => entry.message);
    },
    errors() {
      return logs.filter((entry) => entry.level === 'error');
    },
    dispose() {
      context.dispose();
      world.clear();
      state.dispose();
    }
  };
}

describe('task.wait', () => {
  it('runs a script that never waits straight through', async () => {
    const session = harness('print("start")\nprint("finish")');
    await session.context.start();

    expect(session.printed()).toEqual(['start', 'finish']);
    expect(session.context.isWaiting).toBe(false);
    session.dispose();
  });

  it('suspends at task.wait and resumes once the delay has passed', async () => {
    const session = harness(['print("before")', 'task.wait(0.5)', 'print("after")'].join('\n'));
    await session.context.start();

    expect(session.printed()).toEqual(['before']);
    expect(session.context.isWaiting).toBe(true);

    session.frame(0.4);
    expect(session.printed()).toEqual(['before']);

    session.frame(0.2);
    expect(session.printed()).toEqual(['before', 'after']);
    expect(session.context.isWaiting).toBe(false);
    session.dispose();
  });

  it('drives a loop of waits to completion', async () => {
    const session = harness(
      ['for i = 1, 3 do', '  print("tick " .. i)', '  task.wait(0.1)', 'end', 'print("loop done")'].join('\n')
    );
    await session.context.start();
    expect(session.printed()).toEqual(['tick 1']);

    session.frame(0.1);
    expect(session.printed()).toEqual(['tick 1', 'tick 2']);

    session.frame(0.1);
    expect(session.printed()).toEqual(['tick 1', 'tick 2', 'tick 3']);

    session.frame(0.1);
    expect(session.printed()).toEqual(['tick 1', 'tick 2', 'tick 3', 'loop done']);
    expect(session.context.isWaiting).toBe(false);
    session.dispose();
  });

  it('does not resume before the delay even across many frames', async () => {
    const session = harness(['task.wait(1)', 'print("late")'].join('\n'));
    await session.context.start();

    for (let frame = 0; frame < 50; frame += 1) session.frame(0.016);
    expect(session.printed()).toEqual([]);

    session.frame(0.5);
    expect(session.printed()).toEqual(['late']);
    session.dispose();
  });

  it('returns immediately when called outside the script coroutine', async () => {
    const session = harness(
      [
        'script.onUpdate.Connect(function(dt)',
        '  task.wait(1)',
        '  print("handler ran")',
        'end)'
      ].join('\n')
    );
    await session.context.start();
    expect(session.printed()).toEqual([]);

    session.node.dispatchUpdate(0.016);
    expect(session.printed()).toEqual(['handler ran']);
    expect(session.errors()).toEqual([]);
    session.dispose();
  });

  it('keeps the legacy two-argument form working as a scheduled callback', async () => {
    const session = harness(
      ['task.wait(0.01, function() print("callback") end)', 'print("scheduled")'].join('\n')
    );
    await session.context.start();
    expect(session.printed()).toEqual(['scheduled']);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(session.printed()).toEqual(['scheduled', 'callback']);
    session.dispose();
  });

  it('drops scheduled callbacks when the context is disposed', async () => {
    const session = harness('task.wait(0.01, function() print("should not run") end)');
    await session.context.start();
    session.dispose();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(session.printed()).toEqual([]);
  });
});

describe('script errors', () => {
  it('reports the line in the creator script, not the wrapped chunk', async () => {
    const session = harness(['print("ok")', 'error("boom")'].join('\n'));
    await session.context.start();

    const [error] = session.errors();
    expect(error).toBeDefined();
    expect(error.message).toContain('boom');
    expect(error.line).toBe(2);
    session.dispose();
  });

  it('keeps running after a handler error', async () => {
    const session = harness(
      [
        'script.onUpdate.Connect(function(dt)',
        '  error("handler boom")',
        'end)',
        'print("script done")'
      ].join('\n')
    );
    await session.context.start();
    expect(session.printed()).toEqual(['script done']);

    session.node.dispatchUpdate(0.016);
    expect(session.errors().some((entry) => entry.message.includes('handler boom'))).toBe(true);
    session.dispose();
  });
});
