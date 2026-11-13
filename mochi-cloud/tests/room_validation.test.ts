// Phase 6 edge validation: world edits and score-shaped replicated state.

import { describe, expect, it, vi } from 'vitest';
import { handleRoomMessage, type RoomSession } from '../src/do/roomMessages';
import { DEFAULT_WORLD_OP_LIMITS, SpawnBudget, validateWorldOp } from '../src/do/worldOpValidation';
import { ScoreGuard, validateScoreValue } from '../src/do/scoreGuard';
import { OwnershipTable } from '../src/do/roomOwnership';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';
import type { RoomEvent } from '../src/types/api';

const spawn = (overrides: Record<string, unknown> = {}) => ({
  kind: 'spawn',
  object: {
    id: 'part_1',
    type: 'block',
    position: { x: 1, y: 2, z: 3 },
    scale: { x: 1, y: 1, z: 1 },
    ...overrides
  }
});

describe('validateWorldOp', () => {
  it('accepts a well-formed spawn and destroy', () => {
    expect(validateWorldOp(spawn())).toEqual({ ok: true, kind: 'spawn' });
    expect(validateWorldOp({ kind: 'destroy', id: 'part_1' })).toEqual({ ok: true, kind: 'destroy' });
  });

  it('rejects an unknown kind and a destroy without an id', () => {
    expect(validateWorldOp({ kind: 'teleport' }).ok).toBe(false);
    expect(validateWorldOp({ kind: 'destroy' }).ok).toBe(false);
  });

  it('rejects a spawn without an id or type', () => {
    expect(validateWorldOp({ kind: 'spawn', object: { type: 'block' } }).ok).toBe(false);
    expect(validateWorldOp({ kind: 'spawn', object: { id: 'a' } }).ok).toBe(false);
  });

  it('rejects non-finite coordinates and a non-positive scale', () => {
    const nan = validateWorldOp(spawn({ position: { x: Number.NaN, y: 0, z: 0 } }));
    expect(nan.ok).toBe(false);
    if (!nan.ok) expect(nan.reason).toBe('position');

    const flat = validateWorldOp(spawn({ scale: { x: 0, y: 1, z: 1 } }));
    expect(flat.ok).toBe(false);
    if (!flat.ok) expect(flat.reason).toBe('scale');
  });

  it('rejects a position outside the world bounds', () => {
    const verdict = validateWorldOp(spawn({ position: { x: 999_999, y: 0, z: 0 } }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('bounds');
  });

  it('honours tighter caller limits', () => {
    const verdict = validateWorldOp(spawn(), {
      ...DEFAULT_WORLD_OP_LIMITS,
      bounds: { minX: 0, maxX: 0.5, minY: 0, maxY: 10, minZ: 0, maxZ: 10 }
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('bounds');
  });

  it('rejects an oversized payload', () => {
    const verdict = validateWorldOp(spawn({ luaScript: 'x'.repeat(10_000) }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('bytes');
  });
});

describe('SpawnBudget', () => {
  it('allows a burst, then refuses until time passes', () => {
    const budget = new SpawnBudget(10, 2);
    expect(budget.allow('p1', 0)).toBe(true);
    expect(budget.allow('p1', 0)).toBe(true);
    expect(budget.allow('p1', 0)).toBe(false);
    expect(budget.allow('p1', 100)).toBe(true);
  });

  it('keeps players independent', () => {
    const budget = new SpawnBudget(10, 1);
    expect(budget.allow('p1', 0)).toBe(true);
    expect(budget.allow('p2', 0)).toBe(true);
    expect(budget.allow('p1', 0)).toBe(false);
  });

  it('forgets a player on release', () => {
    const budget = new SpawnBudget(10, 1);
    budget.allow('p1', 0);
    budget.release('p1');
    expect(budget.allow('p1', 0)).toBe(true);
  });
});

describe('score sanity', () => {
  it('clamps negative, non-finite and ceiling values', () => {
    expect(validateScoreValue(-5)).toMatchObject({ ok: false, reason: 'negative', value: 0 });
    expect(validateScoreValue(Number.NaN)).toMatchObject({ ok: false, reason: 'non-finite' });
    expect(validateScoreValue(9_999_999)).toMatchObject({ ok: false, reason: 'ceiling', value: 1_000_000 });
    expect(validateScoreValue(42)).toEqual({ ok: true, value: 42 });
  });

  it('ignores keys that are not scores', () => {
    const guard = new ScoreGuard();
    expect(guard.check('p1', 'favouriteColour', 'blue')).toBeNull();
  });

  it('caps how fast a score may grow', () => {
    const guard = new ScoreGuard({ maxValue: 1_000_000, maxGainPerSecond: 100, keys: ['score'] });
    expect(guard.check('p1', 'score', 50, 0)).toEqual({ ok: true, value: 50 });
    const verdict = guard.check('p1', 'score', 500, 1000);
    expect(verdict?.ok).toBe(false);
    if (verdict && !verdict.ok) expect(verdict.reason).toBe('rate');
    expect(verdict?.value).toBe(150);
  });

  it('resets the baseline when a player leaves', () => {
    const guard = new ScoreGuard({ maxValue: 1_000_000, maxGainPerSecond: 100, keys: ['score'] });
    guard.check('p1', 'score', 50, 0);
    guard.release('p1');
    expect(guard.check('p1', 'score', 50, 0)).toEqual({ ok: true, value: 50 });
  });
});

describe('room relay', () => {
  function harness(now = 0) {
    const broadcast: RoomEvent[] = [];
    const spawnBudget = new SpawnBudget(10, 2);
    const context = {
      players: new Map(),
      rateLimiter: new RoomRateLimiter(),
      luaRuntime: {} as never,
      ownership: new OwnershipTable(),
      spawnBudget,
      scoreGuard: new ScoreGuard({ maxValue: 1000, maxGainPerSecond: 100, keys: ['score'] }),
      nextTick: () => 1,
      broadcast: (event: RoomEvent) => broadcast.push(event),
      broadcastFrom: vi.fn(),
      broadcastPlayerState: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn()
    };
    const session: RoomSession = { playerId: 'p1', username: 'p1', binary: false, ws: {} as WebSocket };
    const send = (event: RoomEvent) => handleRoomMessage(context as never, session, event);
    return { broadcast, send, context, now };
  }

  it('relays a valid spawn and drops an invalid one', () => {
    const { broadcast, send } = harness();
    send({ type: 'world_op', senderId: 'p1', data: spawn() });
    send({ type: 'world_op', senderId: 'p1', data: { kind: 'destroy' } });
    expect(broadcast).toHaveLength(1);
  });

  it('drops spawns once the per-player budget is spent', () => {
    const { broadcast, send } = harness();
    for (let index = 0; index < 5; index += 1) {
      send({ type: 'world_op', senderId: 'p1', data: spawn({ id: `p${index}` }) });
    }
    expect(broadcast).toHaveLength(2);
  });

  it('clamps a cheated score before relaying', () => {
    const { broadcast, send } = harness();
    send({ type: 'state_replicate', senderId: 'p1', data: { key: 'score', value: 999_999 } });
    expect((broadcast[0].data as { value: number }).value).toBe(1000);
  });

  it('relays non-score state unchanged', () => {
    const { broadcast, send } = harness();
    send({ type: 'state_replicate', senderId: 'p1', data: { key: 'colour', value: 'blue' } });
    expect(broadcast[0].data).toEqual({ key: 'colour', value: 'blue' });
  });
});
