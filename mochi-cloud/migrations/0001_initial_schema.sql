-- Migration 0001: Initial schema for Mochi Cloud
-- Users table: creator accounts and player profiles
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'creator',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Games table: game catalog records and metadata
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  creator_id TEXT NOT NULL REFERENCES users(id),
  thumbnail_url TEXT,
  status TEXT DEFAULT 'draft',
  current_version_id TEXT,
  play_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Game versions table: immutable published game releases
CREATE TABLE IF NOT EXISTS game_versions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version_number TEXT NOT NULL,
  changelog TEXT,
  bundle_url TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  status TEXT DEFAULT 'published',
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Game sessions table: player telemetry and active play sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT,
  session_token TEXT NOT NULL,
  ip_hash TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER DEFAULT 0
);

-- B-tree indexes for fast queries and high-concurrency discovery
CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
CREATE INDEX IF NOT EXISTS idx_games_creator_id ON games(creator_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_game_versions_game_id ON game_versions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);
