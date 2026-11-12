// Player lifecycle hooks: scripts must be able to grant starter data on join and
// persist state on leave, and clients must never be able to trigger those hooks.

import { describe, expect, it } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';

function dataStore() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    runtime: () =>
      new ServerLuaRuntime({
        onPlayerDataGet: (playerId, key) => store.get(playerId)?.get(key) ?? null,
        onPlayerDataSet: (playerId, key, value) => {
          const bucket = store.get(playerId) ?? new Map<string, unknown>();
          bucket.set(key, value);
          store.set(playerId, bucket);
        }
      })
  };
}

const SCRIPT = `
  room.onPlayerAdded(function(player)
    player.data.increment("visits", 1)
    player.data.set("name", player.username)
  end)

  room.onPlayerRemoving(function(player)
    player.data.set("left", true)
  end)

  network.OnServerEvent("Count", function(player)
    network.FireClient(player.id, "Count", room.playerCount())
  end)
`;

describe('player lifecycle hooks', () => {
  it('runs PlayerAdded with player data bound', async () => {
    const { store, runtime } = dataStore();
    const lua = runtime();
    await lua.loadScript(SCRIPT);

    lua.addPlayer({ id: 'p1', username: 'Somchai' });

    expect(store.get('p1')?.get('visits')).toBe(1);
    expect(store.get('p1')?.get('name')).toBe('Somchai');
  });

  it('accumulates visits across sessions', async () => {
    const { store, runtime } = dataStore();
    const first = runtime();
    await first.loadScript(SCRIPT);
    first.addPlayer({ id: 'p1', username: 'Somchai' });
    first.removePlayer('p1');

    // A new room instance starts from the persisted value.
    const second = runtime();
    await second.loadScript(SCRIPT);
    second.addPlayer({ id: 'p1', username: 'Somchai' });

    expect(store.get('p1')?.get('visits')).toBe(2);
  });

  it('runs PlayerRemoving before the player record is dropped', async () => {
    const { store, runtime } = dataStore();
    const lua = runtime();
    await lua.loadScript(SCRIPT);
    lua.addPlayer({ id: 'p1', username: 'Somchai' });

    lua.removePlayer('p1');

    expect(store.get('p1')?.get('left')).toBe(true);
  });

  it('reports the live player count', async () => {
    const { runtime } = dataStore();
    const lua = runtime();
    const replies: unknown[] = [];
    lua.setCallbacks({ onFireClient: (_playerId, _event, data) => replies.push(data) });
    await lua.loadScript(SCRIPT);

    lua.addPlayer({ id: 'p1', username: 'A' });
    lua.addPlayer({ id: 'p2', username: 'B' });
    lua.dispatchServerEvent('p1', 'Count', {});

    expect(replies).toEqual([2]);
  });

  it('does not let a client RPC trigger a lifecycle hook', async () => {
    const { store, runtime } = dataStore();
    const lua = runtime();
    await lua.loadScript(SCRIPT);
    lua.setEventAllowlist(['PlayerAdded', 'Count']);

    const handled = lua.dispatchServerEvent('p1', 'PlayerAdded', {});

    expect(handled).toBe(false);
    expect(store.get('p1')).toBeUndefined();
  });

  it('keeps the room alive when a lifecycle hook throws', async () => {
    const { runtime } = dataStore();
    const lua = runtime();
    await lua.loadScript(`
      room.onPlayerAdded(function(player)
        error("boom")
      end)
    `);

    expect(() => lua.addPlayer({ id: 'p1', username: 'A' })).not.toThrow();
    expect(lua.getLogs().some((entry) => entry.message.includes('PlayerAdded'))).toBe(true);
  });
});
