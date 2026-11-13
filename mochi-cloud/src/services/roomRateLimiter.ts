// Per-player flood control for the realtime game room. Each channel gets its
// own token bucket; sustained abuse escalates into a temporary block so a
// single client cannot monopolise the Durable Object.

export interface ChannelLimit {
  ratePerSecond: number;
  burst: number;
}

export const DEFAULT_ROOM_LIMITS: Record<string, ChannelLimit> = {
  player_state: { ratePerSecond: 90, burst: 120 },
  chat: { ratePerSecond: 3, burst: 6 },
  script_rpc: { ratePerSecond: 20, burst: 40 },
  world_op: { ratePerSecond: 30, burst: 60 },
  // Object transforms publish at 10 Hz; the headroom absorbs a burst after a stall.
  transform_delta: { ratePerSecond: 20, burst: 40 },
  ping: { ratePerSecond: 2, burst: 4 },
  leave: { ratePerSecond: 2, burst: 4 }
};

const FALLBACK_LIMIT: ChannelLimit = { ratePerSecond: 30, burst: 60 };

const STRIKE_WINDOW_MS = 10_000;
const STRIKE_THRESHOLD = 20;
const BLOCK_DURATION_MS = 5_000;

class Bucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    now: number
  ) {
    this.tokens = burst;
    this.lastRefill = now;
  }

  tryConsume(now: number): boolean {
    const elapsed = Math.max(0, now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSecond);
      this.lastRefill = now;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface StrikeRecord {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

export class RoomRateLimiter {
  private buckets = new Map<string, Bucket>();
  private strikes = new Map<string, StrikeRecord>();

  constructor(private readonly limits: Record<string, ChannelLimit> = DEFAULT_ROOM_LIMITS) {}

  allow(playerId: string, channel: string, now = Date.now()): boolean {
    const strike = this.strikes.get(playerId);
    if (strike && strike.blockedUntil > now) return false;

    const limit = this.limits[channel] ?? FALLBACK_LIMIT;
    const key = `${playerId}:${channel}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Bucket(limit.ratePerSecond, limit.burst, now);
      this.buckets.set(key, bucket);
    }

    if (bucket.tryConsume(now)) return true;
    this.registerStrike(playerId, now);
    return false;
  }

  isBlocked(playerId: string, now = Date.now()): boolean {
    const strike = this.strikes.get(playerId);
    return Boolean(strike && strike.blockedUntil > now);
  }

  release(playerId: string): void {
    this.strikes.delete(playerId);
    for (const key of Array.from(this.buckets.keys())) {
      if (key.startsWith(`${playerId}:`)) this.buckets.delete(key);
    }
  }

  private registerStrike(playerId: string, now: number): void {
    const existing = this.strikes.get(playerId);
    if (!existing || now - existing.windowStart > STRIKE_WINDOW_MS) {
      this.strikes.set(playerId, { count: 1, windowStart: now, blockedUntil: 0 });
      return;
    }
    existing.count += 1;
    if (existing.count >= STRIKE_THRESHOLD) {
      existing.blockedUntil = now + BLOCK_DURATION_MS;
      existing.count = 0;
      existing.windowStart = now;
    }
  }
}
