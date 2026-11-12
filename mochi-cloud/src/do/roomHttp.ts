// HTTP surface of the game room Durable Object: diagnostics and manual script
// loading. Kept separate so GameRoomDO stays focused on session transport.

import type { MochiEnv } from '../types/env';
import type { PlayerPresence } from '../types/api';
import type { ServerLuaRuntime } from '../services/serverLua';
import { parseScriptPayload } from './roomLua';

export interface RoomHttpContext {
  env: MochiEnv;
  luaRuntime: ServerLuaRuntime;
  snapshot(): {
    activePlayers: number;
    players: PlayerPresence[];
    tick: number;
    gameId: string | null;
    scriptLoaded: boolean;
    scriptVersionId: string | null;
    shard: number | null;
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Returns a response when the request is an HTTP admin call, otherwise null. */
export async function handleRoomHttp(
  request: Request,
  url: URL,
  context: RoomHttpContext
): Promise<Response | null> {
  if (url.pathname.endsWith('/state')) {
    return json({
      ...context.snapshot(),
      environment: context.env.ENVIRONMENT || 'development',
      hasStorage: Boolean(context.env.GAME_ROOM)
    });
  }

  if (url.pathname.endsWith('/script') && request.method === 'POST') {
    const { code, events } = parseScriptPayload(await request.text());
    context.luaRuntime.setEventAllowlist(events);
    const result = await context.luaRuntime.loadScript(code);
    return json({
      ...result,
      events: context.luaRuntime.getEventAllowlist(),
      handlers: context.luaRuntime.getHandlerNames()
    });
  }

  return null;
}
