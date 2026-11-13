import { MochiEnv } from '../types/env';
import { PlayerPresence, RoomEvent } from '../types/api';
import { ServerLuaRuntime } from '../services/serverLua';
import { RoomRateLimiter } from '../services/roomRateLimiter';
import { createRoomLuaRuntime, replicateEvent, scriptRpcEvent } from './roomLua';
import { DEFAULT_INTEREST_RADIUS, encodePlayerStateFrame, withinInterest } from './roomBinary';
import { handleRoomHttp } from './roomHttp';
import { ensureRoomScript } from './roomScriptBundle';
import { RoomPlayerData } from './roomPlayerData';
import { broadcastFromPlayer, broadcastToSessions, sendToSession, socketForPlayer } from './roomBroadcast';
import { handleRoomMessage, type RoomMessageContext, type RoomSession } from './roomMessages';
import { OwnershipTable } from './roomOwnership';
import { SpawnBudget } from './worldOpValidation';
import { ScoreGuard } from './scoreGuard';

// Cloudflare Durable Object for multiplayer game rooms with WebSocket presence
export class GameRoomDO {
  private state: DurableObjectState;
  private env: MochiEnv;
  private sessions: Map<WebSocket, RoomSession> = new Map();
  private players: Map<string, PlayerPresence> = new Map();
  private tick = 0;
  private rateLimiter = new RoomRateLimiter();
  private ownership = new OwnershipTable();
  private spawnBudget = new SpawnBudget();
  private scoreGuard = new ScoreGuard();
  private luaRuntime: ServerLuaRuntime;
  private playerData: RoomPlayerData | null = null;
  private gameId: string | null = null;
  private scriptVersionId: string | null = null;
  private scriptLoaded = false;
  private shard: number | null = null;
  private messageContext: RoomMessageContext;

  constructor(state: DurableObjectState, env: MochiEnv) {
    this.state = state;
    this.env = env;
    this.luaRuntime = createRoomLuaRuntime({
      fireClient: (playerId, eventName, data) =>
        this.sendToPlayer(playerId, scriptRpcEvent(eventName, data)),
      broadcastEvent: (eventName, data) =>
        this.broadcast(scriptRpcEvent(eventName, data)),
      replicateState: (key, value) => this.broadcast(replicateEvent(key, value)),
      getPlayerData: (playerId, key) => this.playerData?.get(playerId, key) ?? null,
      setPlayerData: (playerId, key, value) => {
        this.playerData?.set(playerId, key, value);
        this.scheduleFlushAlarm();
      }
    });
    this.messageContext = {
      players: this.players,
      rateLimiter: this.rateLimiter,
      luaRuntime: this.luaRuntime,
      ownership: this.ownership,
      spawnBudget: this.spawnBudget,
      scoreGuard: this.scoreGuard,
      nextTick: () => ++this.tick,
      broadcast: (event) => this.broadcast(event),
      broadcastFrom: (playerId, event) => this.broadcastFrom(playerId, event),
      broadcastPlayerState: (playerId, presence) => this.broadcastPlayerState(playerId, presence),
      sendTo: (ws, event) => this.send(ws, event),
      close: (ws) => this.closeSession(ws)
    };
  }

  // HTTP entry point: diagnostics, manual script load, or a WebSocket upgrade.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const shardHeader = request.headers.get('x-mochi-shard');
    if (shardHeader && /^\d+$/.test(shardHeader)) this.shard = Number(shardHeader);

    const http = await handleRoomHttp(request, url, {
      env: this.env,
      luaRuntime: this.luaRuntime,
      snapshot: () => ({
        activePlayers: this.players.size,
        players: Array.from(this.players.values()),
        tick: this.tick,
        gameId: this.gameId,
        scriptLoaded: this.scriptLoaded,
        scriptVersionId: this.scriptVersionId,
        shard: this.shard
      })
    });
    if (http) return http;

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (typeof WebSocketPair === 'undefined') {
      return new Response('WebSocketPair is not supported in this runtime', { status: 501 });
    }

    const playerId = url.searchParams.get('playerId') || `player-${crypto.randomUUID().substring(0, 8)}`;
    const username = url.searchParams.get('username') || `Player_${playerId.substring(0, 4)}`;
    const binary = url.searchParams.get('binary') === '1';
    const gameId = url.searchParams.get('gameId') || '';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    await this.joinRoom(server, { playerId, username, binary, gameId });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  /**
   * Prepares the room for a joining player (script + persisted data) and attaches
   * the socket. Split from fetch so the flow is testable without a 101 response.
   */
  public async joinRoom(
    ws: WebSocket,
    options: { playerId: string; username: string; binary: boolean; gameId: string }
  ): Promise<void> {
    await this.prepareRoom(options.gameId);
    await this.playerData?.load(options.playerId);
    this.handleSession(ws, options.playerId, options.username, options.binary);
  }

  // Durable backstop: an alarm wakes the room even after eviction to flush data.
  private scheduleFlushAlarm(): void {
    try {
      this.state.storage.setAlarm?.(Date.now() + 1500);
    } catch {
      // Storage alarms are unavailable in local test doubles.
    }
  }

  /** Cloudflare alarm handler: persist any scripted data still held in memory. */
  async alarm(): Promise<void> {
    await this.playerData?.flushAll();
  }

  // Loads the published server script and the per-player data store for a game.
  private async prepareRoom(gameId: string): Promise<void> {
    if (!gameId) return;

    if (gameId !== this.gameId) {
      this.gameId = gameId;
      this.scriptLoaded = false;
      this.scriptVersionId = null;
      const result = await ensureRoomScript(this.env, this.state.storage, this.luaRuntime, gameId);
      this.scriptLoaded = result.status === 'loaded' || result.status === 'cached';
      this.scriptVersionId = result.versionId ?? null;
      if (result.status === 'error') {
        console.warn(`Server script failed to load for ${gameId}: ${result.error}`);
      }
    }

    if (!this.playerData) {
      this.playerData = new RoomPlayerData(this.env.DB, gameId, (task) => {
        try {
          this.state.waitUntil(task);
        } catch {
          void task;
        }
      });
    }
  }

  // Establish and track WebSocket connection session
  private handleSession(ws: WebSocket, playerId: string, username: string, binary: boolean) {
    ws.accept();

    const session: RoomSession = { playerId, username, binary, ws };
    this.sessions.set(ws, session);

    const presence: PlayerPresence = {
      id: playerId,
      username,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      joinedAt: Date.now()
    };
    this.players.set(playerId, presence);
    this.luaRuntime.addPlayer({ id: playerId, username, x: presence.x, y: presence.y, z: presence.z });

    // Notify the newly joined client of the full room state
    this.send(ws, {
      type: 'room_state',
      senderId: 'server',
      timestamp: Date.now(),
      data: {
        playerId,
        players: Array.from(this.players.values()),
        tick: this.tick,
        interestRadius: DEFAULT_INTEREST_RADIUS,
        shard: this.shard
      }
    });

    // Broadcast player_joined event to all other clients
    this.broadcast(
      { type: 'player_joined', senderId: playerId, timestamp: Date.now(), data: presence },
      ws
    );

    ws.addEventListener('message', (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        handleRoomMessage(this.messageContext, session, JSON.parse(raw) as RoomEvent);
      } catch {
        // Discard malformed JSON packets
      }
    });

    ws.addEventListener('close', () => this.closeSession(ws));
    ws.addEventListener('error', () => this.closeSession(ws));
  }

  // Transforms only reach sessions whose avatar is inside the interest radius.
  // Binary-capable clients get a fixed-size frame instead of JSON.
  private broadcastPlayerState(senderPlayerId: string, presence: PlayerPresence) {
    const frame = encodePlayerStateFrame(presence, this.tick);
    const json = JSON.stringify({
      type: 'player_state',
      senderId: presence.id,
      timestamp: Date.now(),
      data: presence
    });

    for (const [ws, target] of this.sessions) {
      if (target.playerId === senderPlayerId) continue;
      const observer = this.players.get(target.playerId);
      if (!observer || !withinInterest(observer, presence)) continue;
      try {
        ws.send(target.binary ? frame : json);
      } catch {
        this.closeSession(ws);
      }
    }
  }

  private broadcast(event: RoomEvent, excludeWs?: WebSocket) {
    broadcastToSessions(this.sessions, event, excludeWs, (ws) => this.closeSession(ws));
  }

  private broadcastFrom(playerId: string, event: RoomEvent) {
    broadcastFromPlayer(this.sessions, playerId, event, (ws) => this.closeSession(ws));
  }

  private send(ws: WebSocket, event: RoomEvent) {
    sendToSession(ws, event, (socket) => this.closeSession(socket));
  }

  private sendToPlayer(targetPlayerId: string, event: RoomEvent) {
    const ws = socketForPlayer(this.sessions, targetPlayerId);
    if (ws) this.send(ws, event);
  }

  // Clean up disconnected session and persist that player's scripted data
  private closeSession(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (!session) return;

    this.sessions.delete(ws);
    this.players.delete(session.playerId);
    this.luaRuntime.removePlayer(session.playerId);
    this.rateLimiter.release(session.playerId);
    this.ownership.dropPlayer(session.playerId);
    this.spawnBudget.release(session.playerId);
    this.scoreGuard.release(session.playerId);

    const pending = this.playerData?.drop(session.playerId);
    if (pending) {
      try {
        this.state.waitUntil(pending);
      } catch {
        void pending;
      }
    }

    try {
      ws.close();
    } catch {
      // Ignore if socket already closed
    }

    this.broadcast({
      type: 'player_left',
      senderId: session.playerId,
      timestamp: Date.now(),
      data: { playerId: session.playerId }
    });
  }
}
