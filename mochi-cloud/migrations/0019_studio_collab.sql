-- Migration 0019: Team Create collaborators for Mochi Studio drafts.
-- A draft owner can invite other creators into a live collaborative editing
-- session. `map_id` is the studio draft id; roles are 'editor' (may send edit
-- ops) or 'viewer' (read-only session). The draft creator is implicit owner and
-- never needs a row here.

CREATE TABLE IF NOT EXISTS studio_collaborators (
  map_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  invited_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (map_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_collaborators_user ON studio_collaborators(user_id);
