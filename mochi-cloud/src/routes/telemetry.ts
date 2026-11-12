import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import {
  recordEvent,
  summarizeTelemetry,
  TelemetryKind
} from '../services/telemetryDb';

const VALID_KINDS: ReadonlySet<string> = new Set(['fps', 'session_end', 'crash']);
const MAX_PAYLOAD_BYTES = 2 * 1024;
const MAX_GAME_ID_LENGTH = 128;

export const telemetryRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// POST /api/v1/telemetry - Anonymous in-game clients report a single event.
// No auth is required: these clients have no platform account.
telemetryRouter.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    gameId?: unknown;
    userId?: unknown;
    kind?: unknown;
    payload?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Valid JSON body is required' }, 400);
  }

  let gameId: string | null = null;
  if (typeof body.gameId === 'string') {
    const trimmed = body.gameId.trim();
    if (trimmed.length > MAX_GAME_ID_LENGTH) {
      return c.json({ error: 'gameId is too long' }, 400);
    }
    gameId = trimmed || null;
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!VALID_KINDS.has(kind)) {
    return c.json({ error: 'Invalid kind. Allowed: fps, session_end, crash' }, 400);
  }

  const payload: Record<string, unknown> =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).length > MAX_PAYLOAD_BYTES) {
    return c.json({ error: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes` }, 400);
  }

  const userId = typeof body.userId === 'string' ? body.userId : null;
  await recordEvent(c.env.DB, {
    gameId,
    userId,
    kind: kind as TelemetryKind,
    payload
  });

  return c.json({ ok: true }, 201);
});

// GET /api/v1/telemetry/:gameId/summary - Aggregated creator analytics.
telemetryRouter.get('/:gameId/summary', async (c) => {
  const gameId = c.req.param('gameId');
  if (!gameId) return c.json({ error: 'gameId is required' }, 400);

  const summary = await summarizeTelemetry(c.env.DB, gameId);
  return c.json({ ok: true, gameId, ...summary }, 200);
});
