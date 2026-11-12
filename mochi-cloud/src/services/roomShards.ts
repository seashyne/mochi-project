// Room sharding: one Durable Object per shard, filled in order up to a player
// capacity before spilling into the next shard. Keeps a single game scalable
// without asking the client to understand shards.

import type { MochiEnv } from '../types/env';

export const DEFAULT_ROOM_CAPACITY = 40;
export const MAX_ROOM_SHARDS = 8;
const CACHE_TTL_MS = 4000;

export interface ShardInfo {
  roomId: string;
  shard: number;
  players: number;
  capacity: number;
}

interface CachedShard {
  shard: number;
  players: number;
  expiresAt: number;
}

const cache = new Map<string, CachedShard>();

export function shardRoomId(baseRoomId: string, shard: number): string {
  return `${baseRoomId}#${shard}`;
}

async function probeShard(env: MochiEnv, roomId: string): Promise<number | null> {
  try {
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
    const response = await stub.fetch(new Request('https://room.internal/state'));
    if (!response.ok) return null;
    const data = (await response.json()) as { activePlayers?: number };
    return typeof data.activePlayers === 'number' ? data.activePlayers : 0;
  } catch {
    return null;
  }
}

/** Picks the first shard with free capacity, caching the hot shard briefly. */
export async function pickRoomShard(
  env: MochiEnv,
  baseRoomId: string,
  capacity = DEFAULT_ROOM_CAPACITY
): Promise<ShardInfo> {
  const cached = cache.get(baseRoomId);
  if (cached && cached.expiresAt > Date.now() && cached.players < capacity) {
    return {
      roomId: shardRoomId(baseRoomId, cached.shard),
      shard: cached.shard,
      players: cached.players,
      capacity
    };
  }

  for (let shard = 0; shard < MAX_ROOM_SHARDS; shard++) {
    const roomId = shardRoomId(baseRoomId, shard);
    const players = await probeShard(env, roomId);
    if (players === null) continue;
    if (players < capacity) {
      cache.set(baseRoomId, { shard, players, expiresAt: Date.now() + CACHE_TTL_MS });
      return { roomId, shard, players, capacity };
    }
  }

  // Every known shard is full: open the next one.
  const shard = MAX_ROOM_SHARDS;
  return { roomId: shardRoomId(baseRoomId, shard), shard, players: 0, capacity };
}

export function resetShardCache(): void {
  cache.clear();
}
