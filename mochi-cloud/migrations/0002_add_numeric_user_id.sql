-- Migration 0002: Add numeric_id for public player identification and profile search
ALTER TABLE users ADD COLUMN numeric_id INTEGER;

-- Backfill existing creator user with initial numeric id 100001
UPDATE users SET numeric_id = 100001 WHERE numeric_id IS NULL;

-- Unique index for instant numeric player lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_numeric_id ON users(numeric_id);
