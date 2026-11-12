// Interest filtering and compact binary frame tests for GameRoomDO transport.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTEREST_RADIUS,
  encodePlayerStateFrame,
  withinInterest
} from '../src/do/roomBinary';
import { replicateEvent, scriptRpcEvent } from '../src/do/roomLua';
import { PlayerPresence } from '../src/types/api';

function presence(id: string, x: number, y = 0, z = 0): PlayerPresence {
  return { id, username: id, x, y, z, rotation: 0, joinedAt: 0 };
}

describe('Interest management', () => {
  it('keeps nearby players and drops distant ones', () => {
    const observer = presence('a', 0, 0, 0);
    expect(withinInterest(observer, presence('near', 10, 0, 10))).toBe(true);
    expect(withinInterest(observer, presence('edge', DEFAULT_INTEREST_RADIUS, 0, 0))).toBe(true);
    expect(withinInterest(observer, presence('far', DEFAULT_INTEREST_RADIUS + 1, 0, 0))).toBe(false);
  });

  it('honors a custom radius and missing coordinates', () => {
    const observer: PlayerPresence = { id: 'a', username: 'a', joinedAt: 0 };
    const subject: PlayerPresence = { id: 'b', username: 'b', x: 5, y: 0, z: 0, joinedAt: 0 };
    expect(withinInterest(observer, subject, 10)).toBe(true);
    expect(withinInterest(observer, presence('c', 30, 0, 0), 10)).toBe(false);
  });
});

describe('Binary player state frame', () => {
  it('encodes header, id, and float32 transform', () => {
    const frame = encodePlayerStateFrame(presence('peer_1', 1.5, 2.25, -3.75), 42);
    expect(frame.byteLength).toBe(9 + 'peer_1'.length + 16);

    const view = new DataView(frame);
    expect(view.getUint8(0)).toBe(0x4d);
    expect(view.getUint8(1)).toBe(1);
    expect(view.getUint8(2)).toBe(1);
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint8(8)).toBe(6);

    const id = new TextDecoder().decode(new Uint8Array(frame, 9, 6));
    expect(id).toBe('peer_1');
    expect(view.getFloat32(15, true)).toBeCloseTo(1.5);
    expect(view.getFloat32(19, true)).toBeCloseTo(2.25);
    expect(view.getFloat32(23, true)).toBeCloseTo(-3.75);
  });

  it('handles multi-byte ids', () => {
    const frame = encodePlayerStateFrame(presence('ผู้เล่น', 0), 1);
    const idLength = new DataView(frame).getUint8(8);
    const id = new TextDecoder().decode(new Uint8Array(frame, 9, idLength));
    expect(id).toBe('ผู้เล่น');
  });
});

describe('Lua bridge events', () => {
  it('wraps RPC and state replication payloads', () => {
    expect(scriptRpcEvent('wave', { a: 1 })).toMatchObject({
      type: 'script_rpc',
      senderId: 'server',
      data: { eventName: 'wave', data: { a: 1 } }
    });
    expect(replicateEvent('score', 10)).toMatchObject({
      type: 'state_replicate',
      senderId: 'server',
      data: { key: 'score', value: 10 }
    });
  });
});
