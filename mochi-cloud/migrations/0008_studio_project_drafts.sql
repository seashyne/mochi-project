-- Migration 0008: Studio Project Drafts Persistence
-- Stores creator work-in-progress 3D scenes, Lua scripts, and world manifests

CREATE TABLE IF NOT EXISTS studio_project_drafts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  manifest_json TEXT NOT NULL,
  version_number TEXT DEFAULT '0.1.0',
  is_autosave INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_studio_drafts_creator_id ON studio_project_drafts(creator_id);
CREATE INDEX IF NOT EXISTS idx_studio_drafts_game_id ON studio_project_drafts(game_id);
CREATE INDEX IF NOT EXISTS idx_studio_drafts_updated_at ON studio_project_drafts(updated_at DESC);
