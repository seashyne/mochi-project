// Room-owned authority for replicated objects: no peer may overwrite another.

import { describe, expect, it, vi } from 'vitest';
import { handleRoomMessage, type RoomSession } from '../src/do/roomMessages';
import { OwnershipTable } from '../src/do/roomOwnership';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import { SpawnBudget } from '../src/do/worldOpValidation';
import { ScoreGuard } from '../src/do/scoreGuard';
import { InterestIndex } from '../src/do/roomInterest';
import type { RoomEvent } from '../src/types/api';

describe('OwnershipTable', () => {
  it('lets the first claimant own an object and keeps them as owner', () => {
    const table = new OwnershipTable();
    expect(table.claim('npc', 'p1')).toBe(true);
    expect(table.claim('npc', 'p1')).toBe(true);
    expect(table.ownerOf('npc')).toBe('p1');
    expect(table.size).toBe(1);
  });

  it('refuses a second claimant', () => {
    const table = new OwnershipTable();
    table.claim('npc', 'p1');
    expect(table.claim('npc', 'p2')).toBe(false);
    expect(table.ownerOf('npc')).toBe('p1');
  });

  it('only lets the owner release an object', () => {
    const table = new OwnershipTable();
    table.claim('npc', 'p1');
    expect(table.release('npc', 'p2')).toBe(false);
    expect(table.release('npc', 'p1')).toBe(true);
    expect(table.ownerOf('npc')).toBeNull();
    expect(table.claim('npc', 'p2')).toBe(true);
  });

  it('frees everything a disconnected player owned', () => {
    const table = new OwnershipTable();
    table.claim('a', 'p1');
    table.claim('b', 'p1');
    table.claim('c', 'p2');

    expect(table.dropPlayer('p1')).toEqual(['a', 'b']);
    expect(table.size).toBe(1);
    expect(table.ownerOf('c')).toBe('p2');
    expect(table.claim('a', 'p2')).toBe(true);
  });
});

describe('transform_delta authority', () => {
  function harness() {
    const ownership = new OwnershipTable();
    const interest = new InterestIndex();
    interest.update('observer', 0, 0);
    const forwarded: RoomEvent[] = [];
    const context = {
      players: new Map(),
      rateLimiter: new RoomRateLimiter(),
      spawnBudget: new SpawnBudget(),
      scoreGuard: new ScoreGuard(),
      interest,
      sendToPlayer: (_playerId: string, event: RoomEvent) => forwarded.push(event),
      luaRuntime: {} as never,
      ownership,
      nextTick: () => 1,
      broadcast: vi.fn(),
      broadcastFrom: (_playerId: string, event: RoomEvent) => forwarded.push(event),
      broadcastPlayerState: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn()
    };
    const session = (playerId: string): RoomSession => ({
      playerId,
      username: playerId,
      binary: false,
      ws: {} as WebSocket
    });
    const send = (playerId: string, ids: string[], removed: string[] = []) =>
      handleRoomMessage(context as never, session(playerId), {
        type: 'transform_delta',
        senderId: playerId,
        data: {
          tick: 1,
          entries: ids.map((id) => ({ id, x: 1, y: 0, z: 1, ry: 0 })),
          removed
        }
      });
    return { ownership, forwarded, send };
  }

  it('claims the object for the first sender and relays it', () => {
    const { ownership, forwarded, send } = harness();
    send('p1', ['npc']);
    expect(ownership.ownerOf('npc')).toBe('p1');
    expect(forwarded).toHaveLength(1);
  });

  it("drops a peer's entry for an object it does not own", () => {
    const { forwarded, send } = harness();
    send('p1', ['npc']);
    send('p2', ['npc']);
    expect(forwarded).toHaveLength(1);
    expect((forwarded[0].data as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it('relays only the entries the sender is allowed to write', () => {
    const { forwarded, send } = harness();
    send('p1', ['a']);
    send('p2', ['a', 'b']);

    const last = forwarded[forwarded.length - 1].data as { entries: Array<{ id: string }> };
    expect(last.entries.map((entry) => entry.id)).toEqual(['b']);
  });

  it('does not relay anything when every entry is denied', () => {
    const { forwarded, send } = harness();
    send('p1', ['a']);
    send('p2', ['a']);
    expect(forwarded).toHaveLength(1);
  });

  it('only lets the owner remove an object, then lets someone else claim it', () => {
    const { ownership, forwarded, send } = harness();
    send('p1', ['npc']);
    send('p2', [], ['npc']);
    expect(forwarded).toHaveLength(1);
    expect(ownership.ownerOf('npc')).toBe('p1');

    send('p1', [], ['npc']);
    expect(forwarded).toHaveLength(2);
    expect(ownership.ownerOf('npc')).toBeNull();
    expect(ownership.claim('npc', 'p2')).toBe(true);
  });
});
