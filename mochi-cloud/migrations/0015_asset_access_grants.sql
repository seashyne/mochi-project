-- Migration 0015: Asset Access Grants
-- Per-file access control layered on top of the creator file registry. Grants
-- are additive to visibility: a private file stays private unless a grant
-- matches the viewer, a public grant exists, or a share token hash matches.

CREATE TABLE IF NOT EXISTS asset_access_grants (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('user', 'public')),
  grantee_id TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  token_hash TEXT,
  label TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_grants_file ON asset_access_grants(file_id);
CREATE INDEX IF NOT EXISTS idx_asset_grants_grantee ON asset_access_grants(grantee_id);
CREATE INDEX IF NOT EXISTS idx_asset_grants_token ON asset_access_grants(token_hash);
