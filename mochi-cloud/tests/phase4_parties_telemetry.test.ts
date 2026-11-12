import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { MochiEnv } from '../src/types/env';
import { signToken } from '../src/middleware/auth';
import { resetShardCache } from '../src/services/roomShards';

// Purpose-built in-memory D1 that understands only the Phase 4 SQL. Kept local
// to this test file so the shared mockDb.ts stays untouched.
interface PartyRow {
  code: string;
  game_id: string;
  room_id: string;
  shard: number;
  host_user_id: string | null;
  created_at: string;
  expires_at: string;
}

interface TelemetryRow {
  id: string;
  game_id: string | null;
  user_id: string | null;
  kind: string;
  payload_json: string;
  created_at: string;
}

function createPhase4Db(): D1Database {
  const parties = new Map<string, PartyRow>();
  const telemetry: TelemetryRow[] = [];

  function result<T>(rows: T[]): D1Result<T> {
    return {
      results: rows,
      success: true,
      meta: {
        duration: 0,
        rows_read: rows.length,
        rows_written: 0
      } as unknown as D1Result<T>['meta']
    };
  }

  return {
    prepare(query: string) {
      const q = query.trim().replace(/\s+/g, ' ');
      let params: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          params = args;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const res = await stmt.all<T>();
          return res.results.length > 0 ? res.results[0] : null;
        },
        async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          if (q.startsWith('SELECT') && q.includes('FROM room_parties WHERE code = ?')) {
            const row = parties.get(String(params[0]));
            return result<T>((row ? [row] : []) as unknown as T[]);
          }
          if (q.startsWith('SELECT') && q.includes('FROM telemetry_events WHERE game_id = ?')) {
            const rows = telemetry
              .filter((e) => e.game_id === String(params[0]))
              .map((e) => ({ kind: e.kind, payload_json: e.payload_json }));
            return result<T>(rows as unknown as T[]);
          }
          return result<T>([]);
        },
        async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          if (q.startsWith('INSERT INTO room_parties')) {
            const [code, game_id, room_id, shard, host_user_id, created_at, expires_at] =
              params as [string, string, string, number, string | null, string, string];
            parties.set(code, {
              code, game_id, room_id, shard, host_user_id, created_at, expires_at
            });
          } else if (q.startsWith('DELETE FROM room_parties')) {
            const now = String(params[0]);
            for (const [code, row] of parties.entries()) {
              if (row.expires_at <= now) parties.delete(code);
            }
          } else if (q.startsWith('INSERT INTO telemetry_events')) {
            const [id, game_id, user_id, kind, payload_json, created_at] =
              params as [string, string | null, string | null, string, string, string];
            telemetry.push({ id, game_id, user_id, kind, payload_json, created_at });
          }
          return result<T>([]);
        }
      };
      return stmt as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

const SECRET = 'phase4-test-secret-at-least-32-bytes-long';

let env: MochiEnv;
let token: string;

beforeEach(async () => {
  resetShardCache();
  env = {
    DB: createPhase4Db(),
    ASSETS: {} as unknown as R2Bucket,
    GAME_ROOM: {
      idFromName: () => ({} as DurableObjectId),
      get: () => ({
        fetch: async () =>
          new Response(JSON.stringify({ activePlayers: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
      } as unknown as DurableObjectStub)
    } as unknown as DurableObjectNamespace,
    JWT_SECRET: SECRET
  } as unknown as MochiEnv;

  token = await signToken(
    { id: 'host-1', username: 'host', email: 'host@mochi.dev', role: 'player' },
    SECRET,
    3600
  );
});

function postParties(body: Record<string, unknown>, authToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return app.request(
    '/api/v1/parties',
    { method: 'POST', headers, body: JSON.stringify(body) },
    env
  );
}

function postTelemetry(body: Record<string, unknown>) {
  return app.request(
    '/api/v1/telemetry',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    env
  );
}

function insertParty(row: PartyRow) {
  return env.DB.prepare(
    `INSERT INTO room_parties
       (code, game_id, room_id, shard, host_user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.code, row.game_id, row.room_id, row.shard,
      row.host_user_id, row.created_at, row.expires_at
    )
    .run();
}

function insertEvent(row: TelemetryRow) {
  return env.DB.prepare(
    `INSERT INTO telemetry_events
       (id, game_id, user_id, kind, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id, row.game_id, row.user_id, row.kind,
      row.payload_json, row.created_at
    )
    .run();
}

describe('Phase 4 - Party / lobby matchmaking', () => {
  it('create party returns a 6-char code + shard', async () => {
    const res = await postParties({ gameId: 'sky-quest' }, token);
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      code: string; roomId: string; shard: number; expiresAt: string;
    };
    expect(json.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(typeof json.shard).toBe('number');
    expect(json.roomId).toContain('#');
    expect(typeof json.expiresAt).toBe('string');
  });

  it('GET by code returns the same room/shard and no host data', async () => {
    const createRes = await postParties({ gameId: 'sky-quest' }, token);
    const created = (await createRes.json()) as {
      code: string; roomId: string; shard: number;
    };

    const res = await app.request(`/api/v1/parties/${created.code}`, {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe(created.code);
    expect(json.roomId).toBe(created.roomId);
    expect(json.shard).toBe(created.shard);
    expect(json.hostUserId).toBeUndefined();
    expect(json.host_user_id).toBeUndefined();
  });

  it('unknown code -> 404', async () => {
    const res = await app.request('/api/v1/parties/ZZZZZZ', {}, env);
    expect(res.status).toBe(404);
  });

  it('expired party -> 404', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await insertParty({
      code: 'EXPIRED', game_id: 'sky-quest', room_id: 'room_sky-quest#0',
      shard: 0, host_user_id: null, created_at: past, expires_at: past
    });
    const res = await app.request('/api/v1/parties/EXPIRED', {}, env);
    expect(res.status).toBe(404);
  });

  it('invalid (empty) gameId -> 400', async () => {
    expect((await postParties({ gameId: '' }, token)).status).toBe(400);
    expect((await postParties({}, token)).status).toBe(400);
  });

  it('requires auth to create a party', async () => {
    expect((await postParties({ gameId: 'sky-quest' })).status).toBe(401);
  });
});

describe('Phase 4 - Telemetry ingestion and analytics', () => {
  it('telemetry POST 201 (anonymous)', async () => {
    const res = await postTelemetry({ gameId: 'sky-quest', kind: 'fps', payload: { fps: 60 } });
    expect(res.status).toBe(201);
  });

  it('bad kind -> 400', async () => {
    const res = await postTelemetry({ gameId: 'sky-quest', kind: 'keylog', payload: {} });
    expect(res.status).toBe(400);
  });

  it('oversized payload -> 400', async () => {
    const res = await postTelemetry({
      gameId: 'sky-quest', kind: 'crash', payload: { blob: 'x'.repeat(3000) }
    });
    expect(res.status).toBe(400);
  });

  it('summary aggregates fps/crash/session numbers', async () => {
    const g = 'analytics-game';
    await postTelemetry({ gameId: g, kind: 'fps', payload: { fps: 60 } });
    await postTelemetry({ gameId: g, kind: 'fps', payload: { fps: 30 } });
    await postTelemetry({ gameId: g, kind: 'session_end', payload: { seconds: 100 } });
    await postTelemetry({ gameId: g, kind: 'session_end', payload: { seconds: 200 } });
    await postTelemetry({ gameId: g, kind: 'crash', payload: {} });

    const res = await app.request(`/api/v1/telemetry/${g}/summary`, {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      totalEvents: number; fpsAverage: number; crashes: number;
      sessions: number; avgSessionSeconds: number;
    };
    expect(json.totalEvents).toBe(5);
    expect(json.fpsAverage).toBe(45);
    expect(json.crashes).toBe(1);
    expect(json.sessions).toBe(2);
    expect(json.avgSessionSeconds).toBe(150);

    const other = await app.request('/api/v1/telemetry/other-game/summary', {}, env);
    expect(((await other.json()) as { totalEvents: number }).totalEvents).toBe(0);
  });

  it('summary is defensive against malformed rows', async () => {
    const g = 'malformed-game';
    const now = new Date().toISOString();
    await insertEvent({ id: 'e1', game_id: g, user_id: null, kind: 'fps', payload_json: 'not-json', created_at: now });
    await insertEvent({ id: 'e2', game_id: g, user_id: null, kind: 'session_end', payload_json: JSON.stringify({ seconds: 'nope' }), created_at: now });
    await insertEvent({ id: 'e3', game_id: g, user_id: null, kind: 'fps', payload_json: JSON.stringify([1, 2, 3]), created_at: now });

    const res = await app.request(`/api/v1/telemetry/${g}/summary`, {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      totalEvents: number; fpsAverage: number; sessions: number; avgSessionSeconds: number;
    };
    expect(json.totalEvents).toBe(3);
    expect(json.fpsAverage).toBe(0);
    expect(json.sessions).toBe(1);
    expect(json.avgSessionSeconds).toBe(0);
  });
});
