// Room protocol dispatch: maps client events onto presence updates, chat,
// server-script RPCs, and heartbeats. Extracted from GameRoomDO so the Durable
// Object stays a thin transport shell.

import type { PlayerPresence, RoomEvent } from '../types/api';
import type { ServerLuaRuntime } from '../services/serverLua';
import type { RoomRateLimiter } from '../services/roomRateLimiter';
import { parseTransformDelta } from './transformDelta';
import { validateMovement } from './roomMovement';
import type { OwnershipTable } from './roomOwnership';
import type { SpawnBudget } from './worldOpValidation';
import { validateWorldOp } from './worldOpValidation';
import type { ScoreGuard } from './scoreGuard';
import type { InterestIndex } from './roomInterest';

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
  /** The room's authority record for replicated object transforms. */
  ownership: OwnershipTable;
  spawnBudget: SpawnBudget;
  scoreGuard: ScoreGuard;
  interest: InterestIndex;
  /** Sends one event to one player, used for per-observer delivery. */
  sendToPlayer: (playerId: string, event: RoomEvent) => void;
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
        context.interest.update(session.playerId, verdict.x, verdict.z);
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
      // Shape, position bounds and size are checked before the relay; a spawn loop
      // is also capped per player, not just by the generic rate limiter.
      const payload = event.data;
      const verdict = validateWorldOp(payload);
      if (!verdict.ok) break;
      if (verdict.kind === 'spawn' && !context.spawnBudget.allow(session.playerId)) break;
      context.broadcast({
        type: 'world_op',
        senderId: session.playerId,
        timestamp: Date.now(),
        data: payload
      });
      break;
    }

    case 'state_replicate': {
      // Score-shaped state is clamped here, so a client cannot declare itself the
      // winner by writing an arbitrary number.
      const payload = event.data as { key?: unknown; value?: unknown; version?: unknown } | undefined;
      if (!payload || typeof payload.key !== 'string') break;
      const verdict = context.scoreGuard.check(session.playerId, payload.key, payload.value);
      context.broadcast({
        type: 'state_replicate',
        senderId: session.playerId,
        timestamp: Date.now(),
        data: verdict ? { ...payload, value: verdict.value } : payload
      });
      break;
    }

    case 'transform_delta': {
      // Object transforms at 10 Hz. The room, not the sender, decides which
      // objects this peer is allowed to write.
      const payload = parseTransformDelta(event.data);
      if (!payload) break;

      const entries = payload.entries.filter((entry) =>
        context.ownership.claim(entry.id, session.playerId)
      );
      const removed = payload.removed.filter((id) =>
        context.ownership.release(id, session.playerId)
      );
      if (entries.length === 0 && removed.length === 0) break;

      const timestamp = Date.now();
      // One payload per observer, containing only the entries near them. Sending
      // a single broadcast and letting clients filter would still pay for every
      // byte on every connection.
      const deliveries = new Map<string, typeof entries>();
      for (const entry of entries) {
        for (const observer of context.interest.observersOf(entry.x, entry.z)) {
          if (observer === session.playerId) continue;
          const list = deliveries.get(observer) ?? [];
          list.push(entry);
          deliveries.set(observer, list);
        }
      }

      for (const [observer, list] of deliveries) {
        context.sendToPlayer(observer, {
          type: 'transform_delta',
          senderId: session.playerId,
          timestamp,
          data: { ...payload, entries: list, removed: [] }
        });
      }

      // Removals carry no position, so they go to everyone but the sender.
      if (removed.length > 0) {
        context.broadcastFrom(session.playerId, {
          type: 'transform_delta',
          senderId: session.playerId,
          timestamp,
          data: { ...payload, entries: [], removed }
        });
      }
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
