-- Migration 0005: Seed Verified Administrator and Test Player Accounts
-- Provides production-ready credentials for testing authentication and Admin Backoffice

INSERT OR REPLACE INTO users (
  id,
  numeric_id,
  username,
  email,
  password_hash,
  display_name,
  role,
  is_verified,
  coins,
  is_banned,
  created_at,
  updated_at
) VALUES
(
  'usr_admin_master_001',
  9999,
  'admin',
  'admin@game.lenout.com',
  '14508ccb-8b1c-48d0-9ea1-0aee3a2a3ff6:5554e692f4a3f5fa563dd15268d5280b478db8a07fc7a511cb87812ba844a3de',
  'Mochi Master Admin',
  'admin',
  1,
  99999,
  0,
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
),
(
  'usr_test_player_002',
  1001,
  'testplayer',
  'testplayer@game.lenout.com',
  'a8fb4910-62e8-4e38-bac8-804fa9928ac4:e03774cb2de79150792a03306b2d5c8de863e11ef38a77e68c9b558c53e94857',
  'Cyber Tester',
  'creator',
  1,
  2500,
  0,
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
);

-- Ensure testcreator account also has known password and verified status
UPDATE users
SET password_hash = 'a8fb4910-62e8-4e38-bac8-804fa9928ac4:e03774cb2de79150792a03306b2d5c8de863e11ef38a77e68c9b558c53e94857',
    is_verified = 1
WHERE email = 'creator@game.lenout.com';
