// Decoder for compact binary room frames emitted by GameRoomDO when a client
// connects with the `binary=1` query flag.

import { PlayerPresence, RoomEvent } from './types';

const MAGIC = 0x4d;
const VERSION = 1;
const PLAYER_STATE_FRAME = 1;
const HEADER_BYTES = 9;
const POSITION_BYTES = 16;

export interface BinaryPlayerState extends PlayerPresence {
  serverTick: number;
}

export function decodeRoomFrame(buffer: ArrayBuffer): RoomEvent<BinaryPlayerState> | null {
  if (buffer.byteLength < HEADER_BYTES + POSITION_BYTES) return null;

  const view = new DataView(buffer);
  if (view.getUint8(0) !== MAGIC || view.getUint8(1) !== VERSION) return null;
  if (view.getUint8(2) !== PLAYER_STATE_FRAME) return null;

  const tick = view.getUint32(4, true);
  const idLength = view.getUint8(8);
  const stateOffset = HEADER_BYTES + idLength;
  if (idLength === 0 || buffer.byteLength < stateOffset + POSITION_BYTES) return null;

  const id = new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES, idLength));
  return {
    type: 'player_state',
    senderId: id,
    timestamp: Date.now(),
    data: {
      id,
      username: '',
      x: view.getFloat32(stateOffset, true),
      y: view.getFloat32(stateOffset + 4, true),
      z: view.getFloat32(stateOffset + 8, true),
      rotation: view.getFloat32(stateOffset + 12, true),
      joinedAt: 0,
      serverTick: tick
    }
  };
}
