// Binary room frame codec tests mirroring GameRoomDO's compact player-state format.

import { describe, it, expect } from 'vitest';
import { decodeRoomFrame } from '../src/api/roomBinary';
import { buildRoomInviteUrl, getRoomWebSocketUrl, readShardParam } from '../src/api/rooms';

function encodeFrame(id: string, x: number, y: number, z: number, rotation: number, tick = 7): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id);
  const buffer = new ArrayBuffer(9 + idBytes.length + 16);
  const view = new DataView(buffer);
  view.setUint8(0, 0x4d);
  view.setUint8(1, 1);
  view.setUint8(2, 1);
  view.setUint8(3, 0);
  view.setUint32(4, tick, true);
  view.setUint8(8, idBytes.length);
  new Uint8Array(buffer, 9, idBytes.length).set(idBytes);
  const base = 9 + idBytes.length;
  view.setFloat32(base, x, true);
  view.setFloat32(base + 4, y, true);
  view.setFloat32(base + 8, z, true);
  view.setFloat32(base + 12, rotation, true);
  return buffer;
}

describe('Binary room frame decoding', () => {
  it('decodes a server player-state frame into a room event', () => {
    const event = decodeRoomFrame(encodeFrame('peer_1', 12.5, 3, -8, 1.25));
    expect(event).not.toBeNull();
    expect(event?.type).toBe('player_state');
    expect(event?.senderId).toBe('peer_1');
    expect(event?.data?.id).toBe('peer_1');
    expect(event?.data?.x).toBeCloseTo(12.5);
    expect(event?.data?.y).toBeCloseTo(3);
    expect(event?.data?.z).toBeCloseTo(-8);
    expect(event?.data?.rotation).toBeCloseTo(1.25);
    expect(event?.data?.serverTick).toBe(7);
  });

  it('handles multi-byte player ids', () => {
    const event = decodeRoomFrame(encodeFrame('ผู้เล่น_๑', 1, 2, 3, 0));
    expect(event?.data?.id).toBe('ผู้เล่น_๑');
  });

  it('rejects frames with a bad magic or version', () => {
    const badMagic = encodeFrame('p', 0, 0, 0, 0);
    new DataView(badMagic).setUint8(0, 0x00);
    expect(decodeRoomFrame(badMagic)).toBeNull();

    const badVersion = encodeFrame('p', 0, 0, 0, 0);
    new DataView(badVersion).setUint8(1, 9);
    expect(decodeRoomFrame(badVersion)).toBeNull();
  });

  it('rejects truncated frames and unknown frame types', () => {
    expect(decodeRoomFrame(new ArrayBuffer(12))).toBeNull();

    const truncated = encodeFrame('peer_long', 0, 0, 0, 0).slice(0, 14);
    expect(decodeRoomFrame(truncated)).toBeNull();

    const unknownType = encodeFrame('p', 0, 0, 0, 0);
    new DataView(unknownType).setUint8(2, 99);
    expect(decodeRoomFrame(unknownType)).toBeNull();
  });
});

describe('Binary room WebSocket URL', () => {
  it('adds binary=1 only when requested', () => {
    const binaryUrl = getRoomWebSocketUrl('lobby', 'tok', 'usr_1', 'https://api-game.lenout.com', true);
    expect(binaryUrl).toContain('binary=1');
    expect(binaryUrl).toContain('token=tok');
    expect(binaryUrl).toContain('playerId=usr_1');

    const jsonUrl = getRoomWebSocketUrl('lobby', 'tok', 'usr_1', 'https://api-game.lenout.com');
    expect(jsonUrl).not.toContain('binary=1');

    const pinned = getRoomWebSocketUrl('lobby', 'tok', 'usr_1', 'https://api-game.lenout.com', true, 'game_1', 3);
    expect(pinned).toContain('gameId=game_1');
    expect(pinned).toContain('shard=3');
    expect(jsonUrl).not.toContain('shard=');
  });
});

describe('room invites', () => {
  it('reads a pinned shard from the query string', () => {
    expect(readShardParam('?shard=3')).toBe(3);
    expect(readShardParam('?shard=0')).toBe(0);
    expect(readShardParam('?shard=abc')).toBeUndefined();
    expect(readShardParam('')).toBeUndefined();
  });

  it('builds an invite link for a shard', () => {
    const location = { origin: 'https://game.lenout.com', pathname: '/play/map_1' };
    expect(buildRoomInviteUrl(2, location)).toBe('https://game.lenout.com/play/map_1?shard=2');
    expect(buildRoomInviteUrl(null, location)).toBe('https://game.lenout.com/play/map_1');
  });
});
