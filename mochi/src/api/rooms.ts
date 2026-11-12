// Realtime room WebSocket helper and client for Mochi Web Platform

import { resolveDefaultApiUrl } from './client';
import { decodeRoomFrame } from './roomBinary';
import { RoomEvent } from './types';

export function getRoomWebSocketUrl(
  roomId: string,
  token?: string,
  playerId?: string,
  customBaseUrl?: string,
  binary?: boolean,
  gameId?: string,
  shard?: number
): string {
  const base = (customBaseUrl || resolveDefaultApiUrl()).trim().replace(/\/+$/, '');
  const isSecure = base.startsWith('https:');
  const wsProto = isSecure ? 'wss:' : 'ws:';
  const host = base.replace(/^https?:\/\//, '');

  const cleanRoomId = encodeURIComponent(roomId);
  const searchParams = new URLSearchParams();
  if (token) {
    searchParams.set('token', token);
  }
  if (playerId) {
    searchParams.set('playerId', playerId);
  }
  if (binary) {
    searchParams.set('binary', '1');
  }
  // The room resolves its server script and player data from the game record.
  if (gameId) {
    searchParams.set('gameId', gameId);
  }
  // Pinning a shard lets a party land in the same room instance.
  if (shard !== undefined) {
    searchParams.set('shard', String(shard));
  }

  const query = searchParams.toString();
  return `${wsProto}//${host}/api/v1/rooms/${cleanRoomId}/ws${query ? `?${query}` : ''}`;
}

export type RoomEventHandler = (event: RoomEvent) => void;

/** Reads a pinned shard from a query string (`?shard=2`). */
export function readShardParam(search?: string): number | undefined {
  const raw = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const value = new URLSearchParams(raw).get('shard');
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

/** Builds a shareable link that drops a friend into the same room instance. */
export function buildRoomInviteUrl(shard: number | null, location?: { origin: string; pathname: string }): string {
  const origin = location?.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const pathname = location?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const query = shard === null ? '' : `?shard=${shard}`;
  return `${origin}${pathname}${query}`;
}

export class RealtimeRoomClient {
  private socket: WebSocket | null = null;
  private handlers: Set<RoomEventHandler> = new Set();
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly roomId: string,
    private token?: string,
    private playerId?: string,
    private baseUrl?: string,
    private binary?: boolean,
    private gameId?: string,
    private shard?: number
  ) {}

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = getRoomWebSocketUrl(
        this.roomId,
        this.token,
        this.playerId,
        this.baseUrl,
        this.binary,
        this.gameId,
        this.shard
      );
      try {
        this.socket = new WebSocket(url);
        this.socket.binaryType = 'arraybuffer';
      } catch (err) {
        reject(err);
        return;
      }

      this.socket.onopen = () => {
        this.startHeartbeat();
        resolve();
      };

      this.socket.onerror = (err) => {
        reject(err);
      };

      this.socket.onmessage = (messageEvent) => {
        if (messageEvent.data instanceof ArrayBuffer) {
          const decoded = decodeRoomFrame(messageEvent.data);
          if (decoded) this.emit(decoded);
          return;
        }
        if (typeof messageEvent.data !== 'string') return;
        try {
          const parsed = JSON.parse(messageEvent.data) as RoomEvent;
          this.emit(parsed);
        } catch {
          // Ignore malformed payloads from the room
        }
      };

      this.socket.onclose = () => {
        this.stopHeartbeat();
      };
    });
  }

  public subscribe(handler: RoomEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: RoomEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Room event handler error:', err);
      }
    }
  }

  public send(event: RoomEvent): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.handlers.clear();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalId = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}
