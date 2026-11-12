-- Migration 0004: Admin Backoffice Portal schema extensions for Mochi Cloud
-- Add platform economy balance and account suspension flag to users table
ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 100;
ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;

-- Add featured catalog placement flag to games table
ALTER TABLE games ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;

-- Create immutable administrative audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Indexes for newest-first audit log pagination and featured game discovery
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_featured ON games(is_featured);
