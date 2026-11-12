// Wires the Lua runtime callbacks to room transport, keeping the Durable Object
// focused on session and interest management.

import { ServerLuaRuntime } from '../services/serverLua';
import { RoomEvent } from '../types/api';

export interface RoomLuaChannels {
  fireClient: (playerId: string, eventName: string, data: unknown) => void;
  broadcastEvent: (eventName: string, data: unknown) => void;
  replicateState: (key: string, value: unknown) => void;
  getPlayerData?: (playerId: string, key: string) => unknown;
  setPlayerData?: (playerId: string, key: string, value: unknown) => void;
}

export function createRoomLuaRuntime(channels: RoomLuaChannels): ServerLuaRuntime {
  return new ServerLuaRuntime({
    onFireClient: (playerId, eventName, data) =>
      channels.fireClient(playerId, eventName, data),
    onBroadcast: (eventName, data) => channels.broadcastEvent(eventName, data),
    onStateReplicate: (key, value) => channels.replicateState(key, value),
    onPlayerDataGet: (playerId, key) => channels.getPlayerData?.(playerId, key) ?? null,
    onPlayerDataSet: (playerId, key, value) => channels.setPlayerData?.(playerId, key, value)
  });
}

export function replicateEvent(key: string, value: unknown): RoomEvent {
  return {
    type: 'state_replicate',
    senderId: 'server',
    timestamp: Date.now(),
    data: { key, value }
  };
}

export function scriptRpcEvent(eventName: string, data: unknown): RoomEvent {
  return {
    type: 'script_rpc',
    senderId: 'server',
    timestamp: Date.now(),
    data: { eventName, data }
  };
}

// Accepts either a JSON envelope `{ code, events }` or a plain-text script body
// so older clients keep working.
export function parseScriptPayload(body: string): { code: string; events: string[] | null } {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; events?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
      const events = Array.isArray(parsed.events)
        ? parsed.events.filter((entry): entry is string => typeof entry === 'string')
        : null;
      return { code: parsed.code, events };
    }
  } catch {
    // Fall through to the plain-text form.
  }
  return { code: body, events: null };
}
