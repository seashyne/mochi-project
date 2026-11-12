// Tier 5 adversarial tests: server script manifest validation and the client
// remote event bus (registry, direction, payload, and rate limiting).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_RATE_LIMIT,
  MAX_EVENT_PAYLOAD_BYTES,
  MAX_REMOTE_EVENTS,
  MAX_SERVER_SCRIPTS,
  normalizeRemoteEvents,
  normalizeServerManifest,
  normalizeServerScripts,
  serializeServerManifest,
  validateRemoteEventName,
  type RemoteEventDef
} from '../src/engine/scripting/serverManifest';
import { RemoteEventBus, TokenBucket } from '../src/engine/scripting/remoteEventBus';

const events: RemoteEventDef[] = [
  { id: 'e1', name: 'PurchaseItem', direction: 'toServer', rateLimitPerSecond: 2 },
  { id: 'e2', name: 'ScoreChanged', direction: 'toClient', rateLimitPerSecond: 5 }
];

describe('Tier 5: Server Script and Remote Event Hardening', () => {
  describe('Remote event naming', () => {
    it('accepts well-formed names', () => {
      expect(validateRemoteEventName('PurchaseItem')).toBeNull();
      expect(validateRemoteEventName('A')).toBeNull();
      expect(validateRemoteEventName('teleport_2')).toBeNull();
    });

    it('rejects malformed names', () => {
      expect(validateRemoteEventName('')).not.toBeNull();
      expect(validateRemoteEventName('2Fast')).not.toBeNull();
      expect(validateRemoteEventName('has space')).not.toBeNull();
      expect(validateRemoteEventName('drop;table')).not.toBeNull();
      expect(validateRemoteEventName('../etc')).not.toBeNull();
      expect(validateRemoteEventName('a'.repeat(49))).not.toBeNull();
      expect(validateRemoteEventName(42)).not.toBeNull();
    });

    it('blocks reserved runtime names case-insensitively', () => {
      expect(validateRemoteEventName('FireServer')).not.toBeNull();
      expect(validateRemoteEventName('fireserver')).not.toBeNull();
      expect(validateRemoteEventName('OnServerEvent')).not.toBeNull();
      expect(validateRemoteEventName('__proto__')).not.toBeNull();
    });
  });

  describe('Server script normalization', () => {
    it('returns an empty list for missing input', () => {
      expect(normalizeServerScripts(undefined).value).toEqual([]);
      expect(normalizeServerScripts(null).errors).toEqual([]);
    });

    it('rejects non-array input', () => {
      expect(normalizeServerScripts({ code: 'x' }).errors).toContain('serverScripts must be an array');
    });

    it('caps the script count', () => {
      const many = Array.from({ length: MAX_SERVER_SCRIPTS + 3 }, (_, i) => ({
        id: `s${i}`,
        name: `Script ${i}`,
        code: 'print(1)',
        enabled: true
      }));
      const result = normalizeServerScripts(many);
      expect(result.value.length).toBe(MAX_SERVER_SCRIPTS);
      expect(result.errors.some((e) => e.includes('At most'))).toBe(true);
    });

    it('rejects duplicate ids and empty code', () => {
      const result = normalizeServerScripts([
        { id: 'dup', code: 'print(1)' },
        { id: 'dup', code: 'print(2)' },
        { id: 'empty', code: '   ' }
      ]);
      expect(result.value.length).toBe(1);
      expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
      expect(result.errors.some((e) => e.includes('empty code'))).toBe(true);
    });

    it('enforces the 64KB aggregate script ceiling', () => {
      const huge = 'x'.repeat(40 * 1024);
      const result = normalizeServerScripts([
        { id: 'a', code: huge },
        { id: 'b', code: huge }
      ]);
      expect(result.errors.some((e) => e.includes('exceeds'))).toBe(true);
    });

    it('defaults enabled to true and trims names', () => {
      const result = normalizeServerScripts([{ id: 'a', name: '  Spawner  ', code: 'print(1)' }]);
      expect(result.value[0].enabled).toBe(true);
      expect(result.value[0].name).toBe('Spawner');
    });
  });

  describe('Remote event normalization', () => {
    it('clamps rate limits into the supported range', () => {
      const result = normalizeRemoteEvents([
        { name: 'TooFast', rateLimitPerSecond: 9999 },
        { name: 'TooSlow', rateLimitPerSecond: -3 },
        { name: 'Garbage', rateLimitPerSecond: 'fast' }
      ]);
      expect(result.value[0].rateLimitPerSecond).toBe(120);
      expect(result.value[1].rateLimitPerSecond).toBe(1);
      expect(result.value[2].rateLimitPerSecond).toBe(DEFAULT_RATE_LIMIT);
    });

    it('rejects duplicate names regardless of casing', () => {
      const result = normalizeRemoteEvents([{ name: 'Tick' }, { name: 'tick' }]);
      expect(result.value.length).toBe(1);
      expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('caps the event count and defaults direction to toServer', () => {
      const many = Array.from({ length: MAX_REMOTE_EVENTS + 2 }, (_, i) => ({ name: `Evt${i}` }));
      const result = normalizeRemoteEvents(many);
      expect(result.value.length).toBe(MAX_REMOTE_EVENTS);
      expect(result.value.every((event) => event.direction === 'toServer')).toBe(true);
    });

    it('validates the combined manifest and serializes deterministically', () => {
      const manifest = normalizeServerManifest({
        serverScripts: [{ id: 's1', code: 'print(1)' }],
        remoteEvents: [{ name: 'Ping' }]
      });
      expect(manifest.errors).toEqual([]);
      const json = serializeServerManifest(manifest.serverScripts, manifest.remoteEvents);
      expect(JSON.parse(json).remoteEvents[0].name).toBe('Ping');
    });
  });

  describe('Token bucket rate limiting', () => {
    it('allows a burst equal to the rate then refuses', () => {
      const bucket = new TokenBucket(3, 0);
      expect(bucket.tryConsume(0)).toBe(true);
      expect(bucket.tryConsume(0)).toBe(true);
      expect(bucket.tryConsume(0)).toBe(true);
      expect(bucket.tryConsume(0)).toBe(false);
    });

    it('refills proportionally to elapsed time', () => {
      const bucket = new TokenBucket(2, 0);
      bucket.tryConsume(0);
      bucket.tryConsume(0);
      expect(bucket.tryConsume(0)).toBe(false);
      expect(bucket.tryConsume(500)).toBe(true);
    });
  });

  describe('Remote event bus', () => {
    let bus: RemoteEventBus;

    beforeEach(() => {
      bus = new RemoteEventBus(events);
    });

    it('rejects undeclared events', () => {
      const result = bus.emitToServer('UnknownEvent', {});
      expect(result).toEqual({ accepted: false, reason: 'unknown_event' });
    });

    it('enforces declared direction', () => {
      expect(bus.emitToServer('ScoreChanged', {})).toEqual({
        accepted: false,
        reason: 'wrong_direction'
      });
      expect(bus.receiveFromServer('PurchaseItem', {})).toEqual({
        accepted: false,
        reason: 'wrong_direction'
      });
    });

    it('rejects oversized and unserializable payloads', () => {
      const huge = { blob: 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES + 10) };
      expect(bus.emitToServer('PurchaseItem', huge)).toEqual({
        accepted: false,
        reason: 'payload_too_large'
      });

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(bus.emitToServer('PurchaseItem', circular)).toEqual({
        accepted: false,
        reason: 'payload_not_serializable'
      });
    });

    it('rate limits bursts per event', () => {
      expect(bus.emitToServer('PurchaseItem', { id: 1 }).accepted).toBe(true);
      expect(bus.emitToServer('PurchaseItem', { id: 2 }).accepted).toBe(true);
      expect(bus.emitToServer('PurchaseItem', { id: 3 })).toEqual({
        accepted: false,
        reason: 'rate_limited'
      });
    });

    it('dispatches server events to subscribers and supports unsubscribe', () => {
      const received: unknown[] = [];
      const unsubscribe = bus.on('ScoreChanged', (data) => received.push(data));
      expect(bus.receiveFromServer('ScoreChanged', { score: 7 }).accepted).toBe(true);
      expect(received).toEqual([{ score: 7 }]);

      unsubscribe();
      expect(bus.receiveFromServer('ScoreChanged', { score: 9 }).accepted).toBe(true);
      expect(received).toHaveLength(1);
    });

    it('isolates faulty handlers from the transport loop', () => {
      bus.on('ScoreChanged', () => {
        throw new Error('handler exploded');
      });
      const received: unknown[] = [];
      bus.on('ScoreChanged', (data) => received.push(data));
      expect(bus.receiveFromServer('ScoreChanged', { ok: true }).accepted).toBe(true);
      expect(received).toEqual([{ ok: true }]);
    });

    it('tracks rejection statistics by reason', () => {
      bus.emitToServer('Nope', {});
      bus.emitToServer('ScoreChanged', {});
      const stats = bus.getStats();
      expect(stats.rejected).toBe(2);
      expect(stats.byReason.unknown_event).toBe(1);
      expect(stats.byReason.wrong_direction).toBe(1);

      bus.resetStats();
      expect(bus.getStats().rejected).toBe(0);
    });

    it('re-registering events resets buckets and unknown lookups', () => {
      bus.setEvents([{ id: 'x', name: 'Ping', direction: 'toServer', rateLimitPerSecond: 1 }]);
      expect(bus.hasEvent('PurchaseItem')).toBe(false);
      expect(bus.hasEvent('ping')).toBe(true);
      expect(bus.listEvents()).toHaveLength(1);
    });
  });
});
