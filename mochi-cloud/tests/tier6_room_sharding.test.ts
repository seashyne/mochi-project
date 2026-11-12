import { describe, expect, it } from 'vitest';
import { pickRoomShard, resetShardCache } from '../src/services/roomShards';
import type { MochiEnv } from '../src/types/env';

describe('room sharding', () => {
  function shardEnv(counts: Record<string, number>): MochiEnv {
    return {
      GAME_ROOM: {
        idFromName: (name: string) => name,
        get: (name: string) => ({
          fetch: async () => new Response(JSON.stringify({ activePlayers: counts[name] ?? 0 }))
        })
      }
    } as unknown as MochiEnv;
  }

  it('fills the first shard before spilling over', async () => {
    resetShardCache();
    const env = shardEnv({ 'lobby#0': 40, 'lobby#1': 0 });
    const shard = await pickRoomShard(env, 'lobby', 40);
    expect(shard.roomId).toBe('lobby#1');
    expect(shard.shard).toBe(1);
  });

  it('uses shard 0 while it has room', async () => {
    resetShardCache();
    const shard = await pickRoomShard(shardEnv({ 'lobby#0': 3 }), 'lobby', 40);
    expect(shard.roomId).toBe('lobby#0');
    expect(shard.players).toBe(3);
  });

  it('opens a fresh shard when every known shard is full', async () => {
    resetShardCache();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 8; i++) counts[`lobby#${i}`] = 99;
    const shard = await pickRoomShard(shardEnv(counts), 'lobby', 40);
    expect(shard.shard).toBe(8);
  });
});

describe('websocket shard pinning', () => {
  it('routes an explicit shard to that Durable Object and tags the request', async () => {
    const calls: Array<{ roomId: string; shardHeader: string | null }> = [];
    const env = {
      GAME_ROOM: {
        idFromName: (name: string) => name,
        get: (name: string) => ({
          fetch: async (request: Request) => {
            calls.push({ roomId: name, shardHeader: request.headers.get('x-mochi-shard') });
            return new Response(null, { status: 200 });
          }
        })
      }
    } as unknown as MochiEnv;

    const { app } = await import('../src/index');
    const response = await app.request(
      '/api/v1/rooms/lobby/ws?shard=3',
      { headers: { Upgrade: 'websocket' } },
      env
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].roomId).toBe('lobby#3');
    expect(calls[0].shardHeader).toBe('3');
  });
});
