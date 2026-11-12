// End-to-end Durable Object test: a WebSocket join with a gameId must load the
// published server script, dispatch RPCs to it, and persist player data to D1.

import { describe, expect, it } from 'vitest';
import { GameRoomDO } from '../src/do/GameRoomDO';
import type { MochiEnv } from '../src/types/env';

const MANIFEST = JSON.stringify({
  serverScripts: [
    {
      id: 's1',
      name: 'Coins',
      enabled: true,
      code: `
        room.onPlayerAdded(function(player)
          player.data.increment("visits", 1)
        end)

        network.OnServerEvent("Claim", function(player, payload)
          local total = player.data.increment("coins", payload.amount or 1)
          network.FireClient(player.id, "Coins", total)
        end)
      `
    }
  ],
  remoteEvents: [{ name: 'Claim', direction: 'toServer' }]
});

class FakeSocket {
  public accepted = false;
  public sent: string[] = [];
  public closed = false;
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  accept(): void {
    this.accepted = true;
  }

  send(data: unknown): void {
    this.sent.push(typeof data === 'string' ? data : '<binary>');
  }

  close(): void {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function fakeEnv(): { env: MochiEnv; rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        __args: args,
        first: async () =>
          sql.includes('SELECT current_version_id')
            ? { current_version_id: 'v1' }
            : { version_id: 'v1', manifest_json: MANIFEST },
        all: async () => ({
          results: Array.from(rows.entries()).map(([id, value]) => ({
            data_key: id.split(':')[2],
            value_json: value
          }))
        })
      })
    }),
    batch: async (statements: Array<{ __args: unknown[] }>) => {
      for (const statement of statements) {
        rows.set(statement.__args[0] as string, statement.__args[4] as string);
      }
      return [];
    }
  };

  return { env: { DB: db, ENVIRONMENT: 'test' } as unknown as MochiEnv, rows };
}

function fakeState(): { state: DurableObjectState; pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  const store = new Map<string, unknown>();
  const state = {
    storage: {
      get: async (key: string) => store.get(key),
      put: async (key: string, value: unknown) => {
        store.set(key, value);
      }
    },
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    }
  };
  return { state: state as unknown as DurableObjectState, pending };
}

async function join(room: GameRoomDO, playerId: string): Promise<FakeSocket> {
  const socket = new FakeSocket();
  await room.joinRoom(socket as unknown as WebSocket, {
    playerId,
    username: playerId,
    binary: false,
    gameId: 'game_1'
  });
  return socket;
}

function sendRpc(socket: FakeSocket, eventName: string, data: unknown): void {
  socket.emit('message', { data: JSON.stringify({ type: 'script_rpc', timestamp: 0, data: { eventName, data } }) });
}

describe('GameRoomDO server scripting', () => {
  it('loads the published script on the first join', async () => {
    const { env } = fakeEnv();
    const { state } = fakeState();
    const room = new GameRoomDO(state, env);

    await join(room, 'p1');

    const snapshot = (await (await room.fetch(new Request('https://room.internal/state'))).json()) as {
      scriptLoaded: boolean;
      scriptVersionId: string | null;
      gameId: string | null;
      activePlayers: number;
    };
    expect(snapshot.scriptLoaded).toBe(true);
    expect(snapshot.scriptVersionId).toBe('v1');
    expect(snapshot.gameId).toBe('game_1');
    expect(snapshot.activePlayers).toBe(1);
  });

  it('dispatches a client RPC into the script and replies to that client', async () => {
    const { env } = fakeEnv();
    const { state } = fakeState();
    const room = new GameRoomDO(state, env);
    const socket = await join(room, 'p1');
    socket.sent.length = 0;

    sendRpc(socket, 'Claim', { amount: 3 });

    const reply = socket.sent.map((entry) => JSON.parse(entry)).find((entry) => entry.type === 'script_rpc');
    expect(reply?.data).toEqual({ eventName: 'Coins', data: 3 });
  });

  it('persists player data and restores it for a returning player', async () => {
    const { env, rows } = fakeEnv();
    const first = fakeState();
    const room = new GameRoomDO(first.state, env);
    const socket = await join(room, 'p1');

    sendRpc(socket, 'Claim', { amount: 5 });
    sendRpc(socket, 'Claim', { amount: 7 });
    socket.emit('close', {});
    await Promise.all(first.pending);

    expect(rows.get('game_1:p1:coins')).toBe('12');
    expect(rows.get('game_1:p1:visits')).toBe('1');

    // A brand-new room instance (simulating a fresh DO) reads the stored value.
    const second = fakeState();
    const nextRoom = new GameRoomDO(second.state, env);
    const returning = await join(nextRoom, 'p1');
    returning.sent.length = 0;

    sendRpc(returning, 'Claim', { amount: 1 });
    const reply = returning.sent
      .map((entry) => JSON.parse(entry))
      .find((entry) => entry.type === 'script_rpc');
    expect(reply?.data).toEqual({ eventName: 'Coins', data: 13 });
  });

  it('ignores undeclared remote events', async () => {
    const { env } = fakeEnv();
    const { state } = fakeState();
    const room = new GameRoomDO(state, env);
    const socket = await join(room, 'p1');
    socket.sent.length = 0;

    sendRpc(socket, 'NotDeclared', {});

    expect(socket.sent.some((entry) => entry.includes('script_rpc'))).toBe(false);
  });
});
