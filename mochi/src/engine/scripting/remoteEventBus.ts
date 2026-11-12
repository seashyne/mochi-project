// Client-side remote event bus: enforces the declared event registry, payload
// limits, direction, and per-event rate limiting before anything is sent.

import {
  MAX_EVENT_PAYLOAD_BYTES,
  type RemoteEventDef
} from './serverManifest';

export type EmitRejectReason =
  | 'unknown_event'
  | 'wrong_direction'
  | 'rate_limited'
  | 'payload_too_large'
  | 'payload_not_serializable';

export interface EmitResult {
  accepted: boolean;
  reason?: EmitRejectReason;
}

export interface RemoteEventStats {
  sent: number;
  received: number;
  rejected: number;
  byReason: Record<EmitRejectReason, number>;
}

// Token bucket: `rate` tokens per second with a burst equal to `rate`.
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private ratePerSecond: number, now = Date.now()) {
    this.ratePerSecond = Math.max(1, ratePerSecond);
    this.tokens = this.ratePerSecond;
    this.lastRefill = now;
  }

  tryConsume(now = Date.now(), cost = 1): boolean {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.ratePerSecond, this.tokens + elapsedSeconds * this.ratePerSecond);
      this.lastRefill = now;
    }
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  available(now = Date.now()): number {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
    return Math.min(this.ratePerSecond, this.tokens + elapsedSeconds * this.ratePerSecond);
  }
}

export type RemoteEventHandler = (data: unknown) => void;

function payloadBytes(data: unknown): number | null {
  try {
    const serialized = JSON.stringify(data ?? null);
    if (serialized === undefined) return null;
    return new TextEncoder().encode(serialized).length;
  } catch {
    return null;
  }
}

export class RemoteEventBus {
  private events = new Map<string, RemoteEventDef>();
  private buckets = new Map<string, TokenBucket>();
  private handlers = new Map<string, Set<RemoteEventHandler>>();
  private stats: RemoteEventStats = {
    sent: 0,
    received: 0,
    rejected: 0,
    byReason: {
      unknown_event: 0,
      wrong_direction: 0,
      rate_limited: 0,
      payload_too_large: 0,
      payload_not_serializable: 0
    }
  };

  constructor(events: RemoteEventDef[] = []) {
    this.setEvents(events);
  }

  setEvents(events: RemoteEventDef[]): void {
    this.events.clear();
    this.buckets.clear();
    for (const event of events) {
      const key = event.name.toLowerCase();
      this.events.set(key, event);
      this.buckets.set(key, new TokenBucket(event.rateLimitPerSecond));
    }
  }

  hasEvent(name: string): boolean {
    return this.events.has(name.toLowerCase());
  }

  listEvents(): RemoteEventDef[] {
    return Array.from(this.events.values());
  }

  on(name: string, handler: RemoteEventHandler): () => void {
    const key = name.toLowerCase();
    const set = this.handlers.get(key) ?? new Set<RemoteEventHandler>();
    set.add(handler);
    this.handlers.set(key, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(key);
    };
  }

  emitToServer(name: string, data: unknown, now = Date.now()): EmitResult {
    return this.dispatch(name, data, 'toServer', now);
  }

  receiveFromServer(name: string, data: unknown, now = Date.now()): EmitResult {
    return this.dispatch(name, data, 'toClient', now);
  }

  getStats(): RemoteEventStats {
    return {
      ...this.stats,
      byReason: { ...this.stats.byReason }
    };
  }

  resetStats(): void {
    this.stats = {
      sent: 0,
      received: 0,
      rejected: 0,
      byReason: {
        unknown_event: 0,
        wrong_direction: 0,
        rate_limited: 0,
        payload_too_large: 0,
        payload_not_serializable: 0
      }
    };
  }

  private dispatch(
    name: string,
    data: unknown,
    expected: RemoteEventDef['direction'],
    now: number
  ): EmitResult {
    const key = name.toLowerCase();
    const def = this.events.get(key);
    if (!def) return this.reject('unknown_event');
    if (def.direction !== expected) return this.reject('wrong_direction');

    const bytes = payloadBytes(data);
    if (bytes === null) return this.reject('payload_not_serializable');
    if (bytes > MAX_EVENT_PAYLOAD_BYTES) return this.reject('payload_too_large');

    const bucket = this.buckets.get(key);
    if (bucket && !bucket.tryConsume(now)) return this.reject('rate_limited');

    if (expected === 'toServer') {
      this.stats.sent += 1;
    } else {
      this.stats.received += 1;
      const set = this.handlers.get(key);
      if (set) {
        for (const handler of Array.from(set)) {
          try {
            handler(data);
          } catch {
            // A faulty handler must not break the transport loop.
          }
        }
      }
    }
    return { accepted: true };
  }

  private reject(reason: EmitRejectReason): EmitResult {
    this.stats.rejected += 1;
    this.stats.byReason[reason] += 1;
    return { accepted: false, reason };
  }
}
