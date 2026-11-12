-- Migration 0018: party / lobby matchmaking codes and creator analytics telemetry.
-- A party is a short-lived, shareable code that pins a game to one room shard so
-- friends can rendezvous on the same Durable Object. Telemetry stores anonymous
-- in-game events that are later aggregated per game for creator dashboards.

CREATE TABLE IF NOT EXISTS room_parties (
  code TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  shard INTEGER NOT NULL,
  host_user_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_parties_expires ON room_parties(expires_at);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  user_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_game_kind ON telemetry_events(game_id, kind);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at);
