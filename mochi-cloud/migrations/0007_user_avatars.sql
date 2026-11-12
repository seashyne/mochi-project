-- Migration 0007: User 3D Avatars Schema
-- Stores customizable humanoid 3D avatar parts and accessories for each user

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  model_type TEXT DEFAULT 'humanoid_v1',
  head_color TEXT DEFAULT '#fcd34d',
  torso_color TEXT DEFAULT '#0284c7',
  left_arm_color TEXT DEFAULT '#fcd34d',
  right_arm_color TEXT DEFAULT '#fcd34d',
  left_leg_color TEXT DEFAULT '#1e293b',
  right_leg_color TEXT DEFAULT '#1e293b',
  hat_id TEXT,
  shirt_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_avatars_user_id ON user_avatars(user_id);

-- Provision default avatars for existing seeded accounts
INSERT OR IGNORE INTO user_avatars (
  user_id,
  model_type,
  head_color,
  torso_color,
  left_arm_color,
  right_arm_color,
  left_leg_color,
  right_leg_color,
  updated_at
) VALUES
(
  'usr_admin_master_001',
  'humanoid_v1',
  '#fcd34d',
  '#0284c7',
  '#fcd34d',
  '#fcd34d',
  '#1e293b',
  '#1e293b',
  '2026-11-08T00:00:00.000Z'
),
(
  'usr_test_player_002',
  'humanoid_v1',
  '#fcd34d',
  '#0284c7',
  '#fcd34d',
  '#fcd34d',
  '#1e293b',
  '#1e293b',
  '2026-11-08T00:00:00.000Z'
);
