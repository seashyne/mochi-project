// Transport writes for the game room. Extracted from GameRoomDO so the Durable
// Object stays a dispatch shell and the socket fan-out is testable on its own.

import type { RoomEvent } from '../types/api';
import type { RoomSession } from './roomMessages';

type Sessions = Map<WebSocket, RoomSession>;

/** Sends one event to every session except `excludeWs`. */
export function broadcastToSessions(
  sessions: Sessions,
  event: RoomEvent,
  excludeWs: WebSocket | undefined,
  onFailure: (ws: WebSocket) => void
): void {
  const payload = JSON.stringify(event);
  for (const [ws] of sessions) {
    if (ws === excludeWs) continue;
    try {
      ws.send(payload);
    } catch {
      onFailure(ws);
    }
  }
}

/** Relay to everyone but one player's socket; the sender never gets its own echo. */
export function broadcastFromPlayer(
  sessions: Sessions,
  playerId: string,
  event: RoomEvent,
  onFailure: (ws: WebSocket) => void
): void {
  let senderWs: WebSocket | undefined;
  for (const [ws, session] of sessions) {
    if (session.playerId === playerId) {
      senderWs = ws;
      break;
    }
  }
  broadcastToSessions(sessions, event, senderWs, onFailure);
}

/** Sends one event to a single socket. */
export function sendToSession(
  ws: WebSocket,
  event: RoomEvent,
  onFailure: (ws: WebSocket) => void
): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    onFailure(ws);
  }
}

/** Finds the socket belonging to a player, if that player is still connected. */
export function socketForPlayer(sessions: Sessions, playerId: string): WebSocket | undefined {
  for (const [ws, session] of sessions) {
    if (session.playerId === playerId) return ws;
  }
  return undefined;
}
