// Room relay for replicated object transforms: shape check, sender exclusion and
// the rate limit that keeps a 10 Hz stream from flooding the Durable Object.

import { describe, expect, it, vi } from 'vitest';
import { handleRoomMessage } from '../src/do/roomMessages';
import { MAX_TRANSFORM_ENTRIES, parseTransformDelta } from '../src/do/transformDelta';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import { OwnershipTable } from '../src/do/roomOwnership';
import { SpawnBudget } from '../src/do/worldOpValidation';
import { ScoreGuard } from '../src/do/scoreGuard';
import { InterestIndex } from '../src/do/roomInterest';
import type { RoomEvent } from '../src/types/api';

function harness() {
  const forwarded: Array<{ playerId: string; event: RoomEvent }> = [];
  const interest = new InterestIndex();
  // A nearby observer who should receive the delta.
  interest.update('observer', 0, 0);
  const context = {
    players: new Map(),
    rateLimiter: new RoomRateLimiter(),
    spawnBudget: new SpawnBudget(),
    scoreGuard: new ScoreGuard(),
    interest,
    sendToPlayer: (playerId: string, event: RoomEvent) => forwarded.push({ playerId, event }),
    luaRuntime: {} as never,
    ownership: new OwnershipTable(),
    nextTick: () => 1,
    broadcast: vi.fn(),
    broadcastFrom: (playerId: string, event: RoomEvent) => forwarded.push({ playerId, event }),
    broadcastPlayerState: vi.fn(),
    sendTo: vi.fn(),
    close: vi.fn()
  };
  return { context, forwarded };
}

const session = (playerId: string) => ({
  playerId,
  username: playerId,
  binary: false,
  ws: {} as WebSocket
});

const valid = () => ({
  tick: 4,
  entries: [{ id: 'npc_1', x: 1, y: 2, z: 3, ry: 0.5 }],
  removed: [] as string[]
});

describe('transform_delta relay', () => {
  it('delivers a valid delta to an observer in range, never the sender', () => {
    const { context, forwarded } = harness();
    handleRoomMessage(context as never, session('p1'), {
      type: 'transform_delta',
      senderId: 'p1',
      data: valid()
    });

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].playerId).toBe('observer');
    expect(forwarded[0].event.type).toBe('transform_delta');
    expect(forwarded[0].event.senderId).toBe('p1');
    const data = forwarded[0].event.data as { entries: Array<{ id: string; x: number }> };
    expect(data.entries[0]).toEqual({ id: 'npc_1', x: 1, y: 2, z: 3, ry: 0.5 });
  });

  it('drops a payload with no tick, no entries, or a non-numeric coordinate', () => {
    const { context, forwarded } = harness();
    const send = (data: unknown) =>
      handleRoomMessage(context as never, session('p1'), {
        type: 'transform_delta',
        senderId: 'p1',
        data
      });

    send({ entries: valid().entries, removed: [] });
    send({ tick: 1, removed: [] });
    send({ tick: 1, entries: [{ id: 'npc_1', x: 'far', y: 0, z: 0, ry: 0 }], removed: [] });
    send({ tick: 1, entries: [{ id: '', x: 0, y: 0, z: 0, ry: 0 }], removed: [] });
    send({ tick: 1, entries: [{ id: 'a', x: 0, y: 0, z: 0, ry: 0 }], removed: [1] });
    send(null);

    expect(forwarded).toHaveLength(0);
  });

  it('drops an oversized payload instead of relaying it', () => {
    const { context, forwarded } = harness();
    const entries = Array.from({ length: MAX_TRANSFORM_ENTRIES + 1 }, (_, index) => ({
      id: `npc_${index}`,
      x: index,
      y: 0,
      z: 0,
      ry: 0
    }));
    handleRoomMessage(context as never, session('p1'), {
      type: 'transform_delta',
      senderId: 'p1',
      data: { tick: 1, entries, removed: [] }
    });
    expect(forwarded).toHaveLength(0);
  });

  it('accepts exactly the maximum number of entries', () => {
    const { context, forwarded } = harness();
    const entries = Array.from({ length: MAX_TRANSFORM_ENTRIES }, (_, index) => ({
      id: `npc_${index}`,
      x: index,
      y: 0,
      z: 0,
      ry: 0
    }));
    handleRoomMessage(context as never, session('p1'), {
      type: 'transform_delta',
      senderId: 'p1',
      data: { tick: 1, entries, removed: [] }
    });
    expect(forwarded).toHaveLength(1);
  });
});

describe('parseTransformDelta', () => {
  it('normalises a missing removal list to an empty one', () => {
    const parsed = parseTransformDelta({ tick: 2, entries: valid().entries });
    expect(parsed).toEqual({ tick: 2, entries: valid().entries, removed: [] });
  });

  it('keeps removals and drops nothing else', () => {
    const parsed = parseTransformDelta({ tick: 3, entries: [], removed: ['gone'] });
    expect(parsed?.removed).toEqual(['gone']);
  });
});
