// D1 access for per-player, per-game scripted data (the DataStore equivalent).
// Values are stored as JSON so scripts can persist numbers, strings, booleans,
// arrays, and objects.

export interface PlayerDataRow {
  data_key: string;
  value_json: string;
}

const MAX_KEY_LENGTH = 64;

export function isSafeDataKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH && /^[A-Za-z0-9_.:-]+$/.test(key);
}

export async function loadPlayerData(
  db: D1Database | undefined,
  gameId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!db) return {};
  const result = await db
    .prepare('SELECT data_key, value_json FROM player_data WHERE game_id = ? AND user_id = ?')
    .bind(gameId, userId)
    .all<PlayerDataRow>();

  const data: Record<string, unknown> = {};
  for (const row of result.results ?? []) {
    try {
      data[row.data_key] = JSON.parse(row.value_json);
    } catch {
      // Ignore corrupt rows rather than failing the whole load.
    }
  }
  return data;
}

export async function writePlayerData(
  db: D1Database | undefined,
  gameId: string,
  userId: string,
  entries: Record<string, unknown>
): Promise<void> {
  if (!db) return;
  const keys = Object.keys(entries).filter(isSafeDataKey);
  if (keys.length === 0) return;

  const now = new Date().toISOString();
  const statements = keys.map((key) =>
    db
      .prepare(
        `INSERT INTO player_data (id, game_id, user_id, data_key, value_json, version, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(game_id, user_id, data_key) DO UPDATE SET
           value_json = excluded.value_json,
           version = player_data.version + 1,
           updated_at = excluded.updated_at`
      )
      .bind(`${gameId}:${userId}:${key}`, gameId, userId, key, JSON.stringify(entries[key] ?? null), now)
  );

  await db.batch(statements);
}
