// Automated test suite for Client Lua 5.4 scripting execution and engine proxies

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MochiLuaEngine } from '../src/engine/lua/luaEngine';
import { createDefaultPart, createDefaultPlayer } from '../src/engine/lua/bridge';

describe('Client Lua Scripting Runtime Suite', () => {
  let engine: MochiLuaEngine;

  beforeEach(() => {
    engine = new MochiLuaEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('initializes Wasmoon sandbox and executes Lua math calculations', async () => {
    const res = await engine.executeScript('return 21 * 2');
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(42);
    expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('redirects print() and warn() calls to engine memory logs', async () => {
    const res = await engine.executeScript(`
      print("System initialized")
      warn("Low memory warning")
    `);
    expect(res.success).toBe(true);
    const logs = engine.getLogs();
    expect(logs.some((l) => l.level === 'info' && l.message.includes('System initialized'))).toBe(true);
    expect(logs.some((l) => l.level === 'warn' && l.message.includes('Low memory warning'))).toBe(true);
  });

  it('supports Vector3 constructor and part rotation and visibility in Lua', async () => {
    const part = createDefaultPart('Platform_A');
    const res = await engine.executeScript(
      `
      local v = Vector3.new(10, 20, 30)
      script.parent.rotateY(45)
      script.parent.setVisible(false)
      return v.y
    `,
      part
    );

    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(20);
    expect(part.rotation.y).toBe(45);
    expect(part.visible).toBe(false);
  });

  it('triggers onTouch callbacks on proxy parts when player collides', async () => {
    const part = createDefaultPart('Coin');
    const player = createDefaultPlayer();
    let touchedPlayerName = '';

    await engine.executeScript(
      `
      local coin = script.parent
      coin.onTouch(function(p)
        print("Touched by " .. p.username)
        ui.showNotification("Coin collected by " .. p.username)
      end)
    `,
      part
    );

    part.triggerTouch?.(player);

    const logs = engine.getLogs();
    expect(logs.some((l) => l.message.includes('Touched by Creator'))).toBe(true);
    expect(logs.some((l) => l.message.includes('[UI Notification] Coin collected by Creator'))).toBe(true);
  });

  it('queues outgoing network.FireServer() calls and triggers transmitter', async () => {
    let transmittedEvent = '';
    let transmittedData: unknown = null;

    engine.setOnFireServer((evt, data) => {
      transmittedEvent = evt;
      transmittedData = data;
    });

    await engine.executeScript(`
      network.FireServer("PlayerJumped", { height = 15.5 })
    `);

    expect(transmittedEvent).toBe('PlayerJumped');
    expect(transmittedData).toEqual({ height: 15.5 });

    const outgoing = engine.getOutgoingNetworkEvents();
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].event).toBe('PlayerJumped');
  });

  it('registers network.OnClientEvent() and handles dispatched events from server', async () => {
    await engine.executeScript(`
      network.OnClientEvent("ServerEcho", function(data)
        print("Received from server: " .. data.message)
      end)
    `);

    engine.dispatchClientEvent('ServerEcho', { message: 'Hello from Edge Worker' });

    const logs = engine.getLogs();
    expect(logs.some((l) => l.message.includes('Received from server: Hello from Edge Worker'))).toBe(true);
  });

  it('catches runtime syntax and execution errors safely without crashing', async () => {
    const res = await engine.executeScript(`
      local a = nil
      a.nonExistentMethod()
    `);

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    const logs = engine.getLogs();
    expect(logs.some((l) => l.level === 'error')).toBe(true);
  });
});
