// Room wire format: interest filtering and compact binary player-state frames.
// Layout: magic 'M', version 1, type 1, reserved, uint32 tick, uint8 id length,
// UTF-8 player id, then float32 x/y/z/rotation.

import { PlayerPresence } from '../types/api';

export const PLAYER_STATE_FRAME = 1;
export const DEFAULT_INTEREST_RADIUS = 60;

export function withinInterest(
  observer: PlayerPresence,
  subject: PlayerPresence,
  radius = DEFAULT_INTEREST_RADIUS
): boolean {
  const dx = (observer.x ?? 0) - (subject.x ?? 0);
  const dy = (observer.y ?? 0) - (subject.y ?? 0);
  const dz = (observer.z ?? 0) - (subject.z ?? 0);
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

export function encodePlayerStateFrame(
  presence: PlayerPresence,
  tick: number
): ArrayBuffer {
  const idBytes = new TextEncoder().encode(presence.id);
  const buffer = new ArrayBuffer(9 + idBytes.length + 16);
  const view = new DataView(buffer);
  view.setUint8(0, 0x4d);
  view.setUint8(1, 1);
  view.setUint8(2, PLAYER_STATE_FRAME);
  view.setUint8(3, 0);
  view.setUint32(4, tick >>> 0, true);
  view.setUint8(8, idBytes.length);
  new Uint8Array(buffer, 9, idBytes.length).set(idBytes);
  const base = 9 + idBytes.length;
  view.setFloat32(base, presence.x ?? 0, true);
  view.setFloat32(base + 4, presence.y ?? 0, true);
  view.setFloat32(base + 8, presence.z ?? 0, true);
  view.setFloat32(base + 12, presence.rotation ?? 0, true);
  return buffer;
}
