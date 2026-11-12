import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import { pickRoomShard } from '../services/roomShards';
import { createParty, getParty, deleteExpiredParties } from '../services/partyDb';

const DEFAULT_TTL_SECONDS = 3600;
const MAX_GAME_ID_LENGTH = 128;
const MAX_CODE_LENGTH = 16;

export const partiesRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Collapses a game id into a safe, lowercase room slug segment.
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'room'
  );
}

// Extracts a trailing #<shard> suffix from an explicitly supplied room id.
function shardFromRoomId(roomId: string): number {
  const hash = roomId.lastIndexOf('#');
  if (hash === -1) return 0;
  const suffix = roomId.slice(hash + 1);
  return /^\d+$/.test(suffix) ? Number(suffix) : 0;
}

// Only these fields are ever returned. The host user id and raw row are never
// exposed to a client holding a party code.
function publicParty(party: {
  code: string;
  gameId: string;
  roomId: string;
  shard: number;
  expiresAt: string;
}) {
  return {
    code: party.code,
    gameId: party.gameId,
    roomId: party.roomId,
    shard: party.shard,
    expiresAt: party.expiresAt
  };
}

// POST /api/v1/parties - Create a short-lived party (authenticated host).
// With no roomId we resolve a free shard and pin the party to it.
partiesRouter.post('/', authMiddleware, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    gameId?: unknown;
    roomId?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Valid JSON body is required' }, 400);
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
  if (!gameId) return c.json({ error: 'gameId is required' }, 400);
  if (gameId.length > MAX_GAME_ID_LENGTH) {
    return c.json({ error: 'gameId is too long' }, 400);
  }

  let roomId: string;
  let shard: number;
  if (typeof body.roomId === 'string' && body.roomId.trim()) {
    roomId = body.roomId.trim().toLowerCase();
    shard = shardFromRoomId(roomId);
  } else {
    const picked = await pickRoomShard(c.env, `room_${slugify(gameId)}`);
    roomId = picked.roomId;
    shard = picked.shard;
  }

  const user = c.get('user');
  const party = await createParty(
    c.env.DB,
    gameId,
    roomId,
    shard,
    user?.id ?? null,
    DEFAULT_TTL_SECONDS
  );

  return c.json(publicParty(party), 201);
});

// GET /api/v1/parties/:code - Resolve a party so a client can connect to
// room_<slug>#<shard>. Expired or unknown codes are a 404.
partiesRouter.get('/:code', async (c) => {
  const code = c.req.param('code');
  if (!code || code.length > MAX_CODE_LENGTH) {
    return c.json({ error: 'Invalid party code' }, 400);
  }

  const nowIso = new Date().toISOString();
  await deleteExpiredParties(c.env.DB, nowIso);

  const party = await getParty(c.env.DB, code);
  if (!party || party.expiresAt <= nowIso) {
    return c.json({ error: 'Party not found' }, 404);
  }

  return c.json(publicParty(party), 200);
});
