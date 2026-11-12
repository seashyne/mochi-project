-- Migration 0017: persistent per-player scripted data (DataStore equivalent).
-- Values are JSON blobs keyed by (game_id, user_id, data_key) so server scripts
-- can persist numbers, strings, booleans, arrays, and objects across sessions.

CREATE TABLE IF NOT EXISTS player_data (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(game_id, user_id, data_key)
);

CREATE INDEX IF NOT EXISTS idx_player_data_owner ON player_data(game_id, user_id);
CREATE INDEX IF NOT EXISTS idx_player_data_updated ON player_data(game_id, updated_at);
