-- Migration 0020: explicit Team Create session switch per studio draft.
-- A row exists once the owner enables collaborative editing; `enabled = 0`
-- keeps the invite list intact while closing the live room to new sockets.

CREATE TABLE IF NOT EXISTS studio_collab_sessions (
  map_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
