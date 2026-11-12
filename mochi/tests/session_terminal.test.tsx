// Verifies the Output terminal data layer: structured entries, script sources and
// Lua error context (source code + failing line) flowing from a live runtime.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameRuntime } from '../src/engine/runtime/gameRuntime';
import { SessionConsole, parseLuaErrorLine } from '../src/engine/runtime/sessionConsole';
import { SessionTerminal } from '../src/components/runtime/SessionTerminal';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';

class FakePlayer implements RuntimePlayerHandle {
  readonly id = 'player_1';
  readonly name = 'Tester';
  getPosition(): RuntimeVec3 {
    return { x: 0, y: 2, z: 0 };
  }
  setPosition(): void {}
  setVelocity(): void {}
  applyImpulse(): void {}
  respawn(): void {}
  damage(): void {}
  heal(): void {}
  getHealth(): number {
    return 100;
  }
  setHealth(): void {}
  getMaxHealth(): number {
    return 100;
  }
}

function makeRuntime(consoleSession?: SessionConsole): GameRuntime {
  return new GameRuntime({
    scene: new THREE.Scene(),
    physics: new PhysicsWorld(),
    player: new FakePlayer(),
    playerBodyId: 'player_1',
    consoleSession
  });
}

describe('SessionConsole', () => {
  it('stores structured entries and notifies subscribers', () => {
    const terminal = new SessionConsole();
    let notifications = 0;
    terminal.subscribe(() => {
      notifications += 1;
    });
    terminal.push('info', 'coin collected', 'Coin_1', { code: 'print("hi")' });
    terminal.registerScript('Coin_1', 'print("hi")');

    const snapshot = terminal.getSnapshot();
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0].source).toBe('Coin_1');
    expect(snapshot.entries[0].code).toBe('print("hi")');
    expect(snapshot.scripts).toEqual([{ source: 'Coin_1', code: 'print("hi")' }]);
    expect(notifications).toBe(2);

    terminal.clear();
    expect(terminal.getSnapshot().entries).toHaveLength(0);
    expect(terminal.getSnapshot().scripts).toHaveLength(1);
  });

  it('parses wasmoon error line numbers', () => {
    expect(parseLuaErrorLine('[string "print(1)"]:12: attempt to call a nil value')).toBe(12);
    expect(parseLuaErrorLine('Script error: :3: unexpected symbol')).toBe(3);
    expect(parseLuaErrorLine('plain failure')).toBeUndefined();
  });
});

describe('Runtime terminal wiring', () => {
  it('captures print output and registers the script source', async () => {
    const runtime = makeRuntime();
    runtime.runWorldScript('print("terminal works")', 'Main');
    await runtime.whenIdle();

    const snapshot = runtime.consoleSession.getSnapshot();
    expect(snapshot.entries.some((entry) => entry.message === 'terminal works' && entry.source === 'Main')).toBe(true);
    expect(snapshot.scripts.some((script) => script.source === 'Main' && script.code.includes('terminal works'))).toBe(true);
  });

  it('attaches code and the failing line to script errors', async () => {
    const runtime = makeRuntime();
    runtime.sync(
      [
        {
          id: 'broken',
          name: 'Broken',
          type: 'block',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          color: '#6366f1',
          luaScript: 'local value = 1\nerror("kaboom")'
        }
      ],
      new Map()
    );
    await runtime.whenIdle();

    const failure = runtime.consoleSession.getSnapshot().entries.find((entry) => entry.level === 'error');
    expect(failure).toBeDefined();
    expect(failure?.source).toBe('Broken');
    expect(failure?.code).toContain('error("kaboom")');
    expect(failure?.line).toBe(2);
  });

  it('feeds a shared console owned by the host', async () => {
    const shared = new SessionConsole();
    const runtime = makeRuntime(shared);
    runtime.runWorldScript('print("shared")', 'Shared');
    await runtime.whenIdle();
    runtime.dispose();

    expect(shared.getSnapshot().entries.some((entry) => entry.message === 'shared')).toBe(true);
    expect(shared.getSnapshot().scripts).toHaveLength(1);
  });
});

describe('SessionTerminal render', () => {
  it('renders output rows with source and message', () => {
    const terminal = new SessionConsole();
    terminal.push('warn', 'gravity changed', 'World');
    terminal.registerScript('World', 'world.setGravity(0, -5, 0)');

    const html = renderToStaticMarkup(<SessionTerminal session={terminal} title="Test Output" />);
    expect(html).toContain('gravity changed');
    expect(html).toContain('World');
    expect(html).toContain('Scripts (1)');
    expect(html).toContain('Test Output');
  });

  it('renders a compact toggle when collapsed', () => {
    const terminal = new SessionConsole();
    terminal.push('info', 'hidden until opened');
    const html = renderToStaticMarkup(<SessionTerminal session={terminal} defaultOpen={false} />);
    expect(html).toContain('Open Output (F9)');
    expect(html).not.toContain('hidden until opened');
  });
});
