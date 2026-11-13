// Interest management: only peers near an object receive its transform delta.

import { describe, expect, it, vi } from 'vitest';
import { handleRoomMessage, type RoomSession } from '../src/do/roomMessages';
import { InterestIndex } from '../src/do/roomInterest';
import { OwnershipTable } from '../src/do/roomOwnership';
import { ScoreGuard } from '../src/do/scoreGuard';
import { SpawnBudget } from '../src/do/worldOpValidation';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import type { RoomEvent } from '../src/types/api';

describe('InterestIndex', () => {
  it('finds a nearby player and ignores a distant one', () => {
    const index = new InterestIndex({ radius: 10, cellSize: 10 });
    index.update('near', 2, 0);
    index.update('far', 500, 500);

    expect(index.observersOf(0, 0)).toEqual(['near']);
    expect(index.observersOf(0, 0, 1000).sort()).toEqual(['far', 'near']);
  });

  it('moves a player between cells instead of duplicating them', () => {
    const index = new InterestIndex({ radius: 10, cellSize: 10 });
    index.update('p1', 0, 0);
    index.update('p1', 95, 95);

    expect(index.size).toBe(1);
    expect(index.observersOf(0, 0)).toEqual([]);
    expect(index.observersOf(95, 95)).toEqual(['p1']);
  });

  it('forgets a disconnected player', () => {
    const index = new InterestIndex({ radius: 10, cellSize: 10 });
    index.update('p1', 0, 0);
    index.remove('p1');
    expect(index.observersOf(0, 0)).toEqual([]);
    expect(index.playerIds()).toEqual([]);
  });

  it('ignores non-finite positions', () => {
    const index = new InterestIndex();
    index.update('p1', Number.NaN, 0);
    expect(index.size).toBe(0);
  });

  it('uses euclidean distance, not just the cell', () => {
    const index = new InterestIndex({ radius: 5, cellSize: 10 });
    index.update('edge', 4.9, 0);
    index.update('outside', 5.1, 0);
    expect(index.observersOf(0, 0)).toEqual(['edge']);
  });
});

describe('transform_delta interest delivery', () => {
  function harness() {
    const interest = new InterestIndex({ radius: 20, cellSize: 20 });
    interest.update('near', 0, 0);
    interest.update('far', 500, 0);
    interest.update('p1', 0, 0);

    const deliveries: Array<{ playerId: string; event: RoomEvent }> = [];
    const broadcasts: RoomEvent[] = [];
    const context = {
      players: new Map(),
      rateLimiter: new RoomRateLimiter(),
      luaRuntime: {} as never,
      ownership: new OwnershipTable(),
      spawnBudget: new SpawnBudget(),
      scoreGuard: new ScoreGuard(),
      interest,
      sendToPlayer: (playerId: string, event: RoomEvent) => deliveries.push({ playerId, event }),
      nextTick: () => 1,
      broadcast: vi.fn(),
      broadcastFrom: (_playerId: string, event: RoomEvent) => broadcasts.push(event),
      broadcastPlayerState: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn()
    };
    const session: RoomSession = { playerId: 'p1', username: 'p1', binary: false, ws: {} as WebSocket };
    const send = (entries: Array<{ id: string; x: number }>, removed: string[] = []) =>
      handleRoomMessage(context as never, session, {
        type: 'transform_delta',
        senderId: 'p1',
        data: {
          tick: 1,
          entries: entries.map((entry) => ({ ...entry, y: 0, z: 0, ry: 0 })),
          removed
        }
      });
    return { interest, deliveries, broadcasts, send };
  }

  it('delivers an in-range entry only to the nearby observer', () => {
    const { deliveries, send } = harness();
    send([{ id: 'npc', x: 3 }]);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].playerId).toBe('near');
    expect((deliveries[0].event.data as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it('never sends the sender its own entries', () => {
    const { deliveries, send } = harness();
    send([{ id: 'npc', x: 3 }]);
    expect(deliveries.map((entry) => entry.playerId)).not.toContain('p1');
  });

  it('sends nothing when no observer is near the object', () => {
    const { deliveries, send } = harness();
    send([{ id: 'npc', x: 999 }]);
    expect(deliveries).toHaveLength(0);
  });

  it('splits a mixed payload by each observer position', () => {
    const { deliveries, send } = harness();
    send([
      { id: 'close', x: 2 },
      { id: 'distant', x: 500 }
    ]);

    const byPlayer = new Map(deliveries.map((entry) => [entry.playerId, entry.event.data as { entries: Array<{ id: string }> }]));
    expect(byPlayer.get('near')?.entries.map((entry) => entry.id)).toEqual(['close']);
    expect(byPlayer.get('far')?.entries.map((entry) => entry.id)).toEqual(['distant']);
  });

  it('broadcasts removals to everyone because they carry no position', () => {
    const { deliveries, broadcasts, send } = harness();
    // The object must be owned by the sender before its removal is accepted.
    send([{ id: 'gone', x: 3 }]);
    deliveries.length = 0;
    send([], ['gone']);
    expect(broadcasts).toHaveLength(1);
    expect((broadcasts[0].data as { removed: string[] }).removed).toEqual(['gone']);
  });

  it('updates the index from a player_state report', () => {
    const { interest, send } = harness();
    const context = {
      players: new Map<string, { id: string; username: string; x: number; y: number; z: number; joinedAt: number }>([
        ['p1', { id: 'p1', username: 'p1', x: 0, y: 0, z: 0, joinedAt: 0 }]
      ]),
      rateLimiter: new RoomRateLimiter(),
      luaRuntime: {} as never,
      ownership: new OwnershipTable(),
      spawnBudget: new SpawnBudget(),
      scoreGuard: new ScoreGuard(),
      interest,
      sendToPlayer: vi.fn(),
      nextTick: () => 1,
      broadcast: vi.fn(),
      broadcastFrom: vi.fn(),
      broadcastPlayerState: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn()
    };
    const session: RoomSession = { playerId: 'p1', username: 'p1', binary: false, ws: {} as WebSocket };
    handleRoomMessage(context as never, session, {
      type: 'player_state',
      senderId: 'p1',
      data: { id: 'p1', x: 1, y: 0, z: 1 }
    });
    expect(interest.observersOf(1, 1, 1)).toContain('p1');
    void send;
  });
});
