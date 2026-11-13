// Room protocol dispatch: maps client events onto presence updates, chat,
// server-script RPCs, and heartbeats. Extracted from GameRoomDO so the Durable
// Object stays a thin transport shell.

import type { PlayerPresence, RoomEvent } from '../types/api';
import type { ServerLuaRuntime } from '../services/serverLua';
import type { RoomRateLimiter } from '../services/roomRateLimiter';
import { parseTransformDelta } from './transformDelta';
import { validateMovement } from './roomMovement';

export interface RoomSession {
  playerId: string;
  username: string;
  binary: boolean;
  ws: WebSocket;
  /** Last accepted movement report, for the speed check. */
  lastMoveAt?: number;
}

export interface RoomMessageContext {
  players: Map<string, PlayerPresence>;
  rateLimiter: RoomRateLimiter;
  luaRuntime: ServerLuaRuntime;
  nextTick(): number;
  broadcast(event: RoomEvent): void;
  /** Broadcasts to everyone except one player; used for high-rate relays. */
  broadcastFrom(senderPlayerId: string, event: RoomEvent): void;
  broadcastPlayerState(senderPlayerId: string, presence: PlayerPresence): void;
  sendTo(ws: WebSocket, event: RoomEvent): void;
  close(ws: WebSocket): void;
}

export function handleRoomMessage(
  context: RoomMessageContext,
  session: RoomSession,
  event: RoomEvent
): void {
  context.nextTick();
  if (!context.rateLimiter.allow(session.playerId, event.type)) return;

  switch (event.type) {
    case 'player_state': {
      const data = event.data as Partial<PlayerPresence> | undefined;
      const current = context.players.get(session.playerId);
      if (current && data) {
        const now = Date.now();
        const elapsed = session.lastMoveAt ? now - session.lastMoveAt : 50;
        const verdict = validateMovement(current, data, elapsed);
        session.lastMoveAt = now;

        // The room keeps the verdict, not the claim. A speed violation keeps the
        // direction but shortens the step; a teleport is refused outright.
        current.x = verdict.x;
        current.y = verdict.y;
        current.z = verdict.z;
        if (typeof data.rotation === 'number') current.rotation = data.rotation;

        context.broadcastPlayerState(session.playerId, current);

        if (!verdict.accepted) {
          context.sendTo(session.ws, {
            type: 'player_state',
            senderId: 'server',
            timestamp: now,
            data: { ...current, id: session.playerId, corrected: verdict.reason }
          });
        }
      }
      break;
    }

    case 'chat': {
      context.broadcast({
        type: 'chat',
        senderId: session.playerId,
        timestamp: Date.now(),
        data: {
          username: session.username,
          message: event.data
        }
      });
      break;
    }

    case 'script_rpc': {
      const payload = event.data as { eventName?: string; data?: unknown } | undefined;
      if (payload?.eventName) {
        context.luaRuntime.dispatchServerEvent(session.playerId, payload.eventName, payload.data);
      }
      break;
    }

    case 'world_op': {
      // Runtime world edits are relayed verbatim; the sender ignores its own echo.
      const payload = event.data as Record<string, unknown> | undefined;
      if (payload && (payload.kind === 'spawn' || payload.kind === 'destroy')) {
        context.broadcast({
          type: 'world_op',
          senderId: session.playerId,
          timestamp: Date.now(),
          data: payload
        });
      }
      break;
    }

    case 'transform_delta': {
      // Object transforms at 10 Hz. Relayed to everyone but the sender, whose own
      // authority already owns those objects, and only after the shape check.
      const payload = parseTransformDelta(event.data);
      if (!payload) break;
      context.broadcastFrom(session.playerId, {
        type: 'transform_delta',
        senderId: session.playerId,
        timestamp: Date.now(),
        data: payload
      });
      break;
    }

    case 'ping': {
      context.sendTo(session.ws, {
        type: 'pong',
        senderId: 'server',
        timestamp: Date.now(),
        data: event.data
      });
      break;
    }

    case 'leave': {
      context.close(session.ws);
      break;
    }
  }
}
