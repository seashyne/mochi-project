import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import { DEFAULT_ROOM_CAPACITY, pickRoomShard, shardRoomId } from '../services/roomShards';

const MAX_SERVER_SCRIPT_BYTES = 128 * 1024;

export const roomsRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// GET /api/v1/rooms/:id/ws - Upgrade HTTP request to WebSocket multiplayer game room
roomsRouter.get('/:id/ws', async (c) => {
  const roomId = c.req.param('id');
  if (!roomId || roomId.trim().length === 0) {
    return c.json({ error: 'Room ID is required' }, 400);
  }

  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json(
      { error: 'Expected Upgrade: websocket header for realtime multiplayer room' },
      426
    );
  }

  if (!c.env.GAME_ROOM) {
    return c.json(
      { error: 'Durable Object multiplayer namespace GAME_ROOM is not available' },
      503
    );
  }

  // Resolve the shard: an explicit ?shard= pins one (so friends can meet), an id
  // that already carries a shard suffix is used as-is, otherwise fill in order.
  const baseRoomId = roomId.toLowerCase().trim();
  const requestedShard = c.req.query('shard');

  let targetRoomId: string;
  let shardIndex: number | null = null;

  if (requestedShard !== undefined && /^\d+$/.test(requestedShard)) {
    shardIndex = Number(requestedShard);
    targetRoomId = shardRoomId(baseRoomId.split('#')[0], shardIndex);
  } else if (baseRoomId.includes('#')) {
    targetRoomId = baseRoomId;
    const parsed = Number(baseRoomId.split('#')[1]);
    shardIndex = Number.isFinite(parsed) ? parsed : null;
  } else {
    const picked = await pickRoomShard(c.env, baseRoomId);
    targetRoomId = picked.roomId;
    shardIndex = picked.shard;
  }

  const doId = c.env.GAME_ROOM.idFromName(targetRoomId);
  const stub = c.env.GAME_ROOM.get(doId);

  // Forward the WebSocket upgrade request, tagging it with the resolved shard.
  let forwarded = c.req.raw;
  if (shardIndex !== null) {
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.set('x-mochi-shard', String(shardIndex));
      forwarded = new Request(c.req.raw, { headers });
    } catch {
      // Fall back to the untouched request; the room simply reports no shard.
    }
  }

  return stub.fetch(forwarded);
});

// GET /api/v1/rooms/:id/assign - Resolve which shard a new player should join
roomsRouter.get('/:id/assign', async (c) => {
  const roomId = c.req.param('id');
  if (!roomId || roomId.trim().length === 0) {
    return c.json({ error: 'Room ID is required' }, 400);
  }

  const requested = Number(c.req.query('capacity'));
  const capacity = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_ROOM_CAPACITY;
  const shard = await pickRoomShard(c.env, roomId.toLowerCase().trim(), capacity);

  return c.json({
    baseRoomId: roomId,
    roomId: shard.roomId,
    shard: shard.shard,
    players: shard.players,
    capacity: shard.capacity
  });
});

// GET /api/v1/rooms/:id/info - Room discovery and status check
roomsRouter.get('/:id/info', (c) => {
  const roomId = c.req.param('id');
  return c.json({
    roomId,
    protocol: 'mochi-realtime-v1',
    endpoint: `/api/v1/rooms/${roomId}/ws`
  });
});

// POST /api/v1/rooms/:id/script - Load the authoritative server script into the
// room's Durable Object. `events` carries the declared remote event registry so
// undeclared client RPCs are rejected before reaching a handler.
roomsRouter.post('/:id/script', authMiddleware, async (c) => {
  const roomId = c.req.param('id');
  if (!roomId || !roomId.trim()) return c.json({ error: 'Room ID is required' }, 400);
  if (!c.env.GAME_ROOM) {
    return c.json({ error: 'Durable Object multiplayer namespace GAME_ROOM is not available' }, 503);
  }

  let body: { code?: unknown; events?: unknown };
  try {
    body = (await c.req.json()) as { code?: unknown; events?: unknown };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    return c.json({ error: 'code is required' }, 400);
  }
  if (new TextEncoder().encode(body.code).length > MAX_SERVER_SCRIPT_BYTES) {
    return c.json({ error: `Server script exceeds ${MAX_SERVER_SCRIPT_BYTES} bytes` }, 400);
  }

  const events = Array.isArray(body.events)
    ? body.events.filter((entry): entry is string => typeof entry === 'string')
    : null;

  const doId = c.env.GAME_ROOM.idFromName(roomId.toLowerCase().trim());
  const stub = c.env.GAME_ROOM.get(doId);
  const response = await stub.fetch(
    new Request('https://room.internal/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: body.code, events })
    })
  );

  const result = (await response.json()) as Record<string, unknown>;
  return c.json(result, response.ok ? 200 : 400);
});
