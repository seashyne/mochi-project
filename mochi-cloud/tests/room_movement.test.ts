// Server-side movement authority: plausible steps pass, cheats are corrected.

import { describe, expect, it, vi } from 'vitest';
import { handleRoomMessage, type RoomSession } from '../src/do/roomMessages';
import { DEFAULT_MOVEMENT_LIMITS, validateMovement } from '../src/do/roomMovement';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import type { PlayerPresence, RoomEvent } from '../src/types/api';

const at = (x: number, y: number, z: number) => ({ x, y, z });

describe('validateMovement', () => {
  it('accepts a normal 20 Hz step', () => {
    const result = validateMovement(at(0, 0, 0), at(0.4, 0, 0), 50);
    expect(result.accepted).toBe(true);
    expect(result.x).toBeCloseTo(0.4, 6);
  });

  it('refuses a teleport and keeps the previous position', () => {
    const result = validateMovement(at(0, 0, 0), at(900, 0, 900), 50);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('teleport');
    expect(result.x).toBe(0);
    expect(result.z).toBe(0);
  });

  it('shortens an impossible step instead of resetting it', () => {
    const result = validateMovement(at(0, 0, 0), at(10, 0, 0), 50);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('speed');
    expect(result.x).toBeCloseTo(DEFAULT_MOVEMENT_LIMITS.maxSpeed * 0.05, 6);
    expect(result.x).toBeGreaterThan(0);
  });

  it('allows a long step when more time really passed', () => {
    const result = validateMovement(at(0, 0, 0), at(9, 0, 0), 1000);
    expect(result.accepted).toBe(true);
  });

  it('rejects a non-finite position', () => {
    const result = validateMovement(at(1, 2, 3), { x: Number.NaN, y: 2, z: 3 }, 50);
    expect(result.reason).toBe('non-finite');
    expect(result.x).toBe(1);
  });

  it('clamps a position outside the world bounds', () => {
    const bounds = { minX: -10, maxX: 10, minY: 0, maxY: 20, minZ: -10, maxZ: 10 };
    const result = validateMovement(at(0, 0, 0), at(5, 0, 0), 1000, {
      ...DEFAULT_MOVEMENT_LIMITS,
      bounds
    });
    // The step is fine, so the bounds check is not the one that fires here.
    expect(result.accepted).toBe(true);

    const outside = validateMovement(at(9, 0, 0), at(11, 0, 0), 1000, {
      ...DEFAULT_MOVEMENT_LIMITS,
      maxSpeed: 100,
      bounds
    });
    expect(outside.reason).toBe('bounds');
    expect(outside.x).toBe(10);
  });

  it('treats a huge vertical jump as a teleport', () => {
    const result = validateMovement(at(0, 0, 0), at(0, 500, 0), 50);
    expect(result.reason).toBe('teleport');
  });
});

describe('room player_state', () => {
  function harness() {
    const presence: PlayerPresence = { id: 'p1', username: 'Somchai', x: 0, y: 0, z: 0, rotation: 0 };
    const sent: RoomEvent[] = [];
    const broadcasts: PlayerPresence[] = [];
    const context = {
      players: new Map<string, PlayerPresence>([['p1', presence]]),
      rateLimiter: new RoomRateLimiter(),
      luaRuntime: {} as never,
      nextTick: () => 1,
      broadcast: vi.fn(),
      broadcastFrom: vi.fn(),
      broadcastPlayerState: (_id: string, value: PlayerPresence) => broadcasts.push({ ...value }),
      sendTo: (_ws: WebSocket, event: RoomEvent) => sent.push(event),
      close: vi.fn()
    };
    const session: RoomSession = {
      playerId: 'p1',
      username: 'Somchai',
      binary: false,
      ws: {} as WebSocket
    };
    return { context, session, presence, sent, broadcasts };
  }

  const report = (x: number, y: number, z: number) => ({
    type: 'player_state' as const,
    senderId: 'p1',
    data: { id: 'p1', x, y, z }
  });

  it('broadcasts an honest position without correcting the sender', () => {
    const { context, session, sent, broadcasts } = harness();
    handleRoomMessage(context as never, session, report(0.4, 0, 0));
    expect(sent).toHaveLength(0);
    expect(broadcasts[0].x).toBeCloseTo(0.4, 6);
  });

  it('refuses a teleport and sends a correction only to the sender', () => {
    const { context, session, presence, sent, broadcasts } = harness();
    handleRoomMessage(context as never, session, report(900, 0, 900));

    expect(presence.x).toBe(0);
    expect(presence.z).toBe(0);
    expect(broadcasts[0].x).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].senderId).toBe('server');
    const data = sent[0].data as { id: string; corrected: string; x: number };
    expect(data.id).toBe('p1');
    expect(data.corrected).toBe('teleport');
    expect(data.x).toBe(0);
  });

  it('clamps a speed cheat to the allowed step', () => {
    const { context, session, presence, sent } = harness();
    handleRoomMessage(context as never, session, report(10, 0, 0));

    expect(presence.x).toBeCloseTo(DEFAULT_MOVEMENT_LIMITS.maxSpeed * 0.05, 6);
    expect((sent[0].data as { corrected: string }).corrected).toBe('speed');
  });
});
