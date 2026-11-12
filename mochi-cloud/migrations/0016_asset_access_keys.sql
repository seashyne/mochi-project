-- Migration 0016: Asset Access Keys
-- Every uploaded asset gets an opaque access id. Creator content may only be
-- referenced (textures, models, audio) once its key exists and is 'ready',
-- which is the "upload before use" gate for Studio objects.

CREATE TABLE IF NOT EXISTS asset_access_keys (
  access_id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'blocked')),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_access_keys_file ON asset_access_keys(file_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_keys_owner ON asset_access_keys(owner_id, created_at);
