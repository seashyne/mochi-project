// Tier 5 adversarial tests: realtime room flood control. Verifies per-channel
// token buckets, escalation into temporary blocks, and cleanup on disconnect.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_ROOM_LIMITS,
  RoomRateLimiter
} from '../src/services/roomRateLimiter';

describe('Tier 5: Room Rate Limiter Hardening', () => {
  let limiter: RoomRateLimiter;

  beforeEach(() => {
    limiter = new RoomRateLimiter();
  });

  it('allows a burst up to the configured burst size', () => {
    const burst = DEFAULT_ROOM_LIMITS.script_rpc.burst;
    for (let i = 0; i < burst; i += 1) {
      expect(limiter.allow('player-1', 'script_rpc', 1000)).toBe(true);
    }
    expect(limiter.allow('player-1', 'script_rpc', 1000)).toBe(false);
  });

  it('refills tokens proportionally to elapsed time', () => {
    const burst = DEFAULT_ROOM_LIMITS.script_rpc.burst;
    for (let i = 0; i < burst; i += 1) limiter.allow('player-1', 'script_rpc', 0);
    expect(limiter.allow('player-1', 'script_rpc', 0)).toBe(false);
    expect(limiter.allow('player-1', 'script_rpc', 1000)).toBe(true);
  });

  it('keeps channels independent', () => {
    const burst = DEFAULT_ROOM_LIMITS.chat.burst;
    for (let i = 0; i < burst; i += 1) limiter.allow('player-1', 'chat', 0);
    expect(limiter.allow('player-1', 'chat', 0)).toBe(false);
    expect(limiter.allow('player-1', 'player_state', 0)).toBe(true);
  });

  it('keeps players independent', () => {
    const burst = DEFAULT_ROOM_LIMITS.chat.burst;
    for (let i = 0; i < burst; i += 1) limiter.allow('player-1', 'chat', 0);
    expect(limiter.allow('player-1', 'chat', 0)).toBe(false);
    expect(limiter.allow('player-2', 'chat', 0)).toBe(true);
  });

  it('escalates sustained abuse into a temporary block', () => {
    const burst = DEFAULT_ROOM_LIMITS.chat.burst;
    // Exhaust the bucket, then keep hammering until the strike threshold trips.
    for (let i = 0; i < burst; i += 1) limiter.allow('spammer', 'chat', 0);
    for (let i = 0; i < 25; i += 1) limiter.allow('spammer', 'chat', 100);

    expect(limiter.isBlocked('spammer', 200)).toBe(true);
    // Even a fresh channel is refused while the player is blocked.
    expect(limiter.allow('spammer', 'player_state', 200)).toBe(false);
    // The block expires after the cooldown window.
    expect(limiter.isBlocked('spammer', 200 + 6000)).toBe(false);
    expect(limiter.allow('spammer', 'player_state', 200 + 6000)).toBe(true);
  });

  it('never blocks a well-behaved player', () => {
    for (let tick = 0; tick < 200; tick += 1) {
      expect(limiter.allow('good-player', 'player_state', tick * 100)).toBe(true);
    }
    expect(limiter.isBlocked('good-player', 20_000)).toBe(false);
  });

  it('applies a conservative fallback for undeclared channels', () => {
    let allowed = 0;
    for (let i = 0; i < 100; i += 1) {
      if (limiter.allow('player-1', 'custom_channel', 0)) allowed += 1;
    }
    expect(allowed).toBe(60);
  });

  it('releases state on disconnect so a reconnect starts clean', () => {
    const burst = DEFAULT_ROOM_LIMITS.chat.burst;
    for (let i = 0; i < burst; i += 1) limiter.allow('player-1', 'chat', 0);
    expect(limiter.allow('player-1', 'chat', 0)).toBe(false);

    limiter.release('player-1');
    expect(limiter.allow('player-1', 'chat', 0)).toBe(true);
    expect(limiter.isBlocked('player-1', 0)).toBe(false);
  });

  it('honours custom limit tables', () => {
    const strict = new RoomRateLimiter({ chat: { ratePerSecond: 1, burst: 1 } });
    expect(strict.allow('p', 'chat', 0)).toBe(true);
    expect(strict.allow('p', 'chat', 0)).toBe(false);
  });
});
