-- Migration 0014: Creator File Registry
-- Folder tree and asset metadata with per-file visibility. R2 bytes stay
-- content-addressed and shared; registry rows are the ownership/access layer.

CREATE TABLE IF NOT EXISTS asset_folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES asset_folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_folders_owner ON asset_folders(owner_id, parent_id);

CREATE TABLE IF NOT EXISTS asset_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES asset_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_files_owner ON asset_files(owner_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_asset_files_object_key ON asset_files(object_key);
CREATE INDEX IF NOT EXISTS idx_asset_files_visibility ON asset_files(visibility);