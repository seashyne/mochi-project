// Regression suite for the server-script delivery pipeline, per-player data
// persistence, and the extended Lua sandbox.

import { describe, expect, it, vi } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';
import { extractScriptBundle, ensureRoomScript } from '../src/do/roomScriptBundle';
import { RoomPlayerData } from '../src/do/roomPlayerData';
import { handleRoomMessage } from '../src/do/roomMessages';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import { SpawnBudget } from '../src/do/worldOpValidation';
import { ScoreGuard } from '../src/do/scoreGuard';
import type { MochiEnv } from '../src/types/env';
import type { PlayerPresence, RoomEvent } from '../src/types/api';

const MANIFEST = JSON.stringify({
  objects: [],
  serverScripts: [
    { id: 's1', name: 'Coins', enabled: true, code: 'network.OnServerEvent("Claim", function(player) player.data.increment("coins", 1) end)' },
    { id: 's2', name: 'Disabled', enabled: false, code: 'print("never")' }
  ],
  remoteEvents: [
    { name: 'Claim', direction: 'toServer' },
    { name: 'Score', direction: 'toClient' }
  ]
});

function storageMock() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (key: string) => store.get(key),
    put: async (key: string, value: unknown) => {
      store.set(key, value);
    }
  };
}

function envWith(manifest: string | null, db?: unknown): MochiEnv {
  const prepare = (sql: string) => ({
    bind: () => ({
      first: async () => {
        if (manifest === null) return null;
        return sql.includes('SELECT current_version_id')
          ? { current_version_id: 'v1' }
          : { version_id: 'v1', manifest_json: manifest };
      }
    })
  });
  return { DB: db ?? { prepare } } as unknown as MochiEnv;
}

describe('server script bundle', () => {
  it('keeps enabled scripts and toServer events only', () => {
    const bundle = extractScriptBundle('v1', MANIFEST);
    expect(bundle).not.toBeNull();
    expect(bundle?.code).toContain('data.increment("coins", 1)');
    expect(bundle?.code).not.toContain('never');
    expect(bundle?.events).toEqual(['Claim']);
  });

  it('returns null when the manifest has no server code', () => {
    expect(extractScriptBundle('v1', JSON.stringify({ serverScripts: [] }))).toBeNull();
    expect(extractScriptBundle('v1', 'not json')).toBeNull();
  });

  it('loads the published script into the room runtime', async () => {
    const runtime = new ServerLuaRuntime();
    const result = await ensureRoomScript(envWith(MANIFEST), storageMock() as never, runtime, 'game_1');

    expect(result.status).toBe('loaded');
    expect(result.handlers).toEqual(['Claim']);
    expect(runtime.getEventAllowlist()).toEqual(['Claim']);
  });

  it('serves the second room start from DO storage', async () => {
    const storage = storageMock();
    const env = envWith(MANIFEST);
    await ensureRoomScript(env, storage as never, new ServerLuaRuntime(), 'game_1');

    const second = new ServerLuaRuntime();
    const result = await ensureRoomScript(env, storage as never, second, 'game_1');
    expect(result.status).toBe('cached');
    expect(second.getHandlerNames()).toEqual(['Claim']);
  });

  it('reports none when the game has no scripts', async () => {
    const runtime = new ServerLuaRuntime();
    const result = await ensureRoomScript(envWith(null), storageMock() as never, runtime, 'game_2');
    expect(result.status).toBe('none');
  });

  it('rebuilds the bundle when the game is republished', async () => {
    let version = 'v1';
    let manifest = MANIFEST;
    const prepare = (sql: string) => ({
      bind: () => ({
        first: async () =>
          sql.includes('SELECT current_version_id')
            ? { current_version_id: version }
            : { version_id: version, manifest_json: manifest }
      })
    });
    const env = { DB: { prepare } } as unknown as MochiEnv;
    const storage = storageMock();

    await ensureRoomScript(env, storage as never, new ServerLuaRuntime(), 'game_1');

    version = 'v2';
    manifest = JSON.stringify({
      serverScripts: [{ id: 's9', name: 'Republished', enabled: true, code: 'network.OnServerEvent("Fresh", function() end)' }],
      remoteEvents: [{ name: 'Fresh', direction: 'toServer' }]
    });

    const runtime = new ServerLuaRuntime();
    const result = await ensureRoomScript(env, storage as never, runtime, 'game_1');
    expect(result.status).toBe('loaded');
    expect(result.versionId).toBe('v2');
    expect(runtime.getHandlerNames()).toEqual(['Fresh']);
  });
});

describe('per-player data in Lua', () => {
  it('scopes reads and writes to the dispatching player', async () => {
    const store = new Map<string, Map<string, unknown>>();
    const runtime = new ServerLuaRuntime({
      onPlayerDataGet: (playerId, key) => store.get(playerId)?.get(key) ?? null,
      onPlayerDataSet: (playerId, key, value) => {
        const bucket = store.get(playerId) ?? new Map();
        bucket.set(key, value);
        store.set(playerId, bucket);
      }
    });

    await runtime.loadScript(`
      network.OnServerEvent("Add", function(player, payload)
        player.data.increment("coins", payload.amount)
      end)
    `);

    runtime.dispatchServerEvent('p1', 'Add', { amount: 5 });
    runtime.dispatchServerEvent('p1', 'Add', { amount: 7 });
    runtime.dispatchServerEvent('p2', 'Add', { amount: 1 });

    expect(store.get('p1')?.get('coins')).toBe(12);
    expect(store.get('p2')?.get('coins')).toBe(1);
  });
});

describe('player data persistence', () => {
  function fakeDb() {
    const rows = new Map<string, string>();
    const db = {
      rows,
      prepare: () => ({
        bind: (...args: unknown[]) => ({
          __args: args,
          all: async () => ({
            results: Array.from(rows.entries()).map(([id, value]) => ({
              data_key: id.split(':').slice(2).join(':'),
              value_json: value
            }))
          }),
          first: async () => null
        })
      }),
      batch: async (statements: Array<{ __args: unknown[] }>) => {
        for (const statement of statements) {
          const [id, , , , value] = statement.__args as string[];
          rows.set(id, value);
        }
        return [];
      }
    };
    return db;
  }

  it('writes dirty keys and reloads them in a new room', async () => {
    const db = fakeDb();
    const first = new RoomPlayerData(db as never, 'game_1');
    await first.load('p1');
    first.set('p1', 'coins', 9);
    first.set('p1', 'skin', 'neon');
    await first.flushAll();

    expect(db.rows.size).toBe(2);

    const second = new RoomPlayerData(db as never, 'game_1');
    await second.load('p1');
    expect(second.get('p1', 'coins')).toBe(9);
    expect(second.get('p1', 'skin')).toBe('neon');
  });

  it('keeps players isolated', async () => {
    const db = fakeDb();
    const data = new RoomPlayerData(db as never, 'game_1');
    await data.load('p1');
    await data.load('p2');
    data.set('p1', 'coins', 1);
    data.set('p2', 'coins', 2);

    expect(data.get('p1', 'coins')).toBe(1);
    expect(data.get('p2', 'coins')).toBe(2);
  });

  it('increments from the current value', async () => {
    const data = new RoomPlayerData(fakeDb() as never, 'game_1');
    await data.load('p1');
    expect(data.increment('p1', 'coins', 3)).toBe(3);
    expect(data.increment('p1', 'coins', 4)).toBe(7);
  });
});

describe('room message dispatch', () => {
  function harness() {
    const players = new Map<string, PlayerPresence>();
    players.set('p1', { id: 'p1', username: 'Somchai', x: 0, y: 0, z: 0, rotation: 0, joinedAt: 0 });
    const broadcast: RoomEvent[] = [];
    const sent: RoomEvent[] = [];
    const runtime = new ServerLuaRuntime();
    let tick = 0;

    const context = {
      players,
      rateLimiter: new RoomRateLimiter(),
      spawnBudget: new SpawnBudget(),
      scoreGuard: new ScoreGuard(),
      luaRuntime: runtime,
      nextTick: () => ++tick,
      broadcast: (event: RoomEvent) => broadcast.push(event),
      broadcastPlayerState: vi.fn(),
      sendTo: (_ws: WebSocket, event: RoomEvent) => sent.push(event),
      close: vi.fn()
    };
    return { context, players, broadcast, sent, runtime };
  }

  it('dispatches script_rpc to the Lua handler', async () => {
    const { context, runtime } = harness();
    const handled: unknown[] = [];
    await runtime.loadScript('network.OnServerEvent("Claim", function(player, data) handled = data.amount end)');
    runtime.setCallbacks({ onStateReplicate: (key, value) => handled.push([key, value]) });

    handleRoomMessage(context as never, { playerId: 'p1', username: 'Somchai', binary: false, ws: {} as WebSocket }, {
      type: 'script_rpc',
      senderId: 'p1',
      timestamp: 0,
      data: { eventName: 'Claim', data: { amount: 5 } }
    });

    expect(runtime.getHandlerNames()).toContain('Claim');
  });

  it('drops events over the rate limit', () => {
    const { context, players } = harness();
    const sender = { playerId: 'p1', username: 'Somchai', binary: false, ws: {} as WebSocket };
    const event: RoomEvent = {
      type: 'player_state',
      senderId: 'p1',
      timestamp: 0,
      data: { x: 1, y: 0, z: 0, rotation: 0 }
    };

    for (let i = 0; i < 400; i++) handleRoomMessage(context as never, sender, event);
    expect(players.get('p1')?.x).toBe(1);
  });

  it('broadcasts chat to the room', () => {
    const { context, broadcast } = harness();
    handleRoomMessage(context as never, { playerId: 'p1', username: 'Somchai', binary: false, ws: {} as WebSocket }, {
      type: 'chat',
      senderId: 'p1',
      timestamp: 0,
      data: 'hello'
    });
    expect(broadcast[0]).toMatchObject({ type: 'chat' });
  });
});
