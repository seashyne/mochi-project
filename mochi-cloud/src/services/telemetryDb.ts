// Persistence and aggregation for anonymous in-game telemetry events. Payloads
// are stored as JSON text and parsed defensively so a single corrupt row can
// never break a creator's analytics summary.

export type TelemetryKind = 'fps' | 'session_end' | 'crash';

export interface TelemetryEvent {
  id?: string;
  gameId: string | null;
  userId?: string | null;
  kind: TelemetryKind;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface TelemetrySummary {
  totalEvents: number;
  fpsAverage: number;
  crashes: number;
  sessions: number;
  avgSessionSeconds: number;
}

interface TelemetryRow {
  kind: string;
  payload_json: string;
}

/** Inserts one telemetry event. Fields are normalized before storage. */
export async function recordEvent(db: D1Database, event: TelemetryEvent): Promise<void> {
  await db
    .prepare(
      `INSERT INTO telemetry_events
         (id, game_id, user_id, kind, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id ?? crypto.randomUUID(),
      event.gameId ?? null,
      event.userId ?? null,
      event.kind,
      JSON.stringify(event.payload ?? {}),
      event.createdAt ?? new Date().toISOString()
    )
    .run();
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed JSON falls through to an empty, safe payload.
  }
  return {};
}

function finiteNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Aggregates the supported event kinds into a creator-facing summary. */
export async function summarizeTelemetry(
  db: D1Database,
  gameId: string
): Promise<TelemetrySummary> {
  const result = await db
    .prepare('SELECT kind, payload_json FROM telemetry_events WHERE game_id = ?')
    .bind(gameId)
    .all<TelemetryRow>();
  const rows = result.results || [];

  let totalEvents = 0;
  let fpsSum = 0;
  let fpsCount = 0;
  let crashes = 0;
  let sessions = 0;
  let sessionSecondsSum = 0;

  for (const row of rows) {
    totalEvents += 1;
    const payload = parsePayload(row.payload_json);

    if (row.kind === 'fps') {
      const fps = finiteNumber(payload.fps, payload.value);
      if (fps !== null) {
        fpsSum += fps;
        fpsCount += 1;
      }
    } else if (row.kind === 'crash') {
      crashes += 1;
    } else if (row.kind === 'session_end') {
      sessions += 1;
      const seconds = finiteNumber(
        payload.seconds,
        payload.durationSeconds,
        payload.duration
      );
      if (seconds !== null) sessionSecondsSum += seconds;
    }
  }

  return {
    totalEvents,
    fpsAverage: fpsCount > 0 ? fpsSum / fpsCount : 0,
    crashes,
    sessions,
    avgSessionSeconds: sessions > 0 ? sessionSecondsSum / sessions : 0
  };
}
