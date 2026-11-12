// Server-side Lua execution and RPC handling. These tests assert real
// interpreter semantics: script bodies execute, state is script-driven, and
// client payloads pass through untouched.

import { describe, it, expect } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';
import { unpackMochiServer, packMochiServer, validateMochiServer } from '../src/services/mochiPackage';

describe('Server Lua Scripting & Package Suite (mochi-cloud)', () => {
  it('executes top-level statements and captures print output', async () => {
    const runtime = new ServerLuaRuntime();
    const res = await runtime.loadScript(`
      print("[Server] Initializing authority")
      local score = 10
      print("score", score)
    `);

    expect(res.success).toBe(true);
    const logs = runtime.getLogs();
    expect(logs.some((l) => l.message.includes('[Server] Initializing authority'))).toBe(true);
    expect(logs.some((l) => l.message.includes('score\t10'))).toBe(true);
  });

  it('runs a registered OnServerEvent handler on client RPC', async () => {
    const fired: Array<{ id: string; event: string; data: unknown }> = [];
    const replicated: Array<{ key: string; value: unknown }> = [];

    const runtime = new ServerLuaRuntime({
      onFireClient: (id, event, data) => fired.push({ id, event, data }),
      onStateReplicate: (key, value) => replicated.push({ key, value })
    });

    runtime.addPlayer({ id: 'plr_007', username: 'Agent007' });

    await runtime.loadScript(`
      network.OnServerEvent("ClaimCoin", function(player, data)
        print("Awarding score to " .. player.username)
        state.set("totalCoinsClaimed", 1)
        network.FireClient(player.id, "ScoreUpdated", { score = data.value })
      end)
    `);

    const dispatched = runtime.dispatchServerEvent('plr_007', 'ClaimCoin', { value: 50 });
    expect(dispatched).toBe(true);

    expect(fired).toHaveLength(1);
    expect(fired[0].id).toBe('plr_007');
    expect(fired[0].event).toBe('ScoreUpdated');
    expect(fired[0].data).toEqual({ score: 50 });

    expect(replicated).toContainEqual({ key: 'totalCoinsClaimed', value: 1 });
    expect(runtime.getState('totalCoinsClaimed')).toBe(1);
    expect(runtime.getLogs().some((l) => l.message.includes('Awarding score to Agent007'))).toBe(true);
  });

  it('broadcasts exactly what the script builds', async () => {
    const broadcasts: Array<{ event: string; data: unknown }> = [];

    const runtime = new ServerLuaRuntime({
      onBroadcast: (event, data) => broadcasts.push({ event, data })
    });
    runtime.addPlayer({ id: 'plr_champ', username: 'Champion' });

    await runtime.loadScript(`
      network.OnServerEvent("ClaimCoin", function(player, data)
        network.Broadcast("ServerAnnouncement", { message = player.username .. " won!" })
      end)
    `);

    runtime.dispatchServerEvent('plr_champ', 'ClaimCoin', { value: 100 });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].event).toBe('ServerAnnouncement');
    expect(broadcasts[0].data).toEqual({ message: 'Champion won!' });
  });

  it('rejects events that are not in the declared registry', async () => {
    const runtime = new ServerLuaRuntime();
    runtime.setEventAllowlist(['ClaimCoin']);

    await runtime.loadScript(`
      network.OnServerEvent("ClaimCoin", function(player, data)
        network.FireClient(player.id, "ScoreUpdated", { ok = true })
      end)
    `);

    expect(runtime.dispatchServerEvent('plr_1', 'UndeclaredEvent', {})).toBe(false);
    expect(runtime.getLogs().some((l) => l.message.includes('undeclared'))).toBe(true);
    expect(runtime.dispatchServerEvent('plr_1', 'ClaimCoin', {})).toBe(true);
  });

  it('reports script syntax errors instead of silently succeeding', async () => {
    const runtime = new ServerLuaRuntime();
    const res = await runtime.loadScript('network.OnServerEvent("Broken", function(player, data)');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    expect(runtime.getLogs().some((l) => l.level === 'error')).toBe(true);
  });

  it('isolates handler failures from the transport', async () => {
    const runtime = new ServerLuaRuntime();
    await runtime.loadScript(`
      network.OnServerEvent("Boom", function(player, data)
        local x = nil
        x.y = 1
      end)
    `);

    expect(runtime.dispatchServerEvent('plr_1', 'Boom', {})).toBe(false);
    expect(runtime.getLogs().some((l) => l.message.includes('Error in OnServerEvent(Boom)'))).toBe(true);
  });

  it('handles server-side .mochi package unpacking and verification', () => {
    const pkg = {
      manifest: {
        formatVersion: '1.0' as const,
        gameId: 'g_srv_01',
        slug: 'srv-game',
        title: 'Server Authority Arena',
        version: '1.0.0',
        entry: {
          clientScript: 'scripts/main.client.lua',
          serverScript: 'scripts/main.server.lua'
        }
      },
      scripts: {
        'scripts/main.client.lua': { path: 'scripts/main.client.lua', role: 'client' as const, code: 'print("client")' },
        'scripts/main.server.lua': { path: 'scripts/main.server.lua', role: 'server' as const, code: 'print("server")' }
      },
      assets: {},
      scenes: {}
    };

    const packed = packMochiServer(pkg);
    const unpacked = unpackMochiServer(packed);

    expect(unpacked.manifest.title).toBe('Server Authority Arena');
    expect(unpacked.scripts['scripts/main.server.lua'].code).toBe('print("server")');

    const validation = validateMochiServer(unpacked);
    expect(validation.valid).toBe(true);
  });
});
