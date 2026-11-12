-- Migration 0006: Seed Real Published 3D Worlds into Cloudflare D1
-- Ensures live API /api/v1/games serves genuine database records with valid 3D scene manifests

INSERT OR REPLACE INTO games (
  id,
  slug,
  title,
  description,
  creator_id,
  thumbnail_url,
  status,
  current_version_id,
  play_count,
  is_featured,
  created_at,
  updated_at
) VALUES
(
  'game_obby_01',
  'neon-sky-obby',
  'Neon Sky Obby [พาร์คัวร์]',
  'High-altitude 3D parkour course with moving platforms, jump pads, and races.',
  'usr_admin_master_001',
  NULL,
  'published',
  'ver_obby_01_v1',
  1420,
  1,
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
),
(
  'game_tycoon_02',
  'starforge-tycoon',
  'Starforge Tycoon [อวกาศ]',
  'Build modular orbital stations, harvest asteroids, and trade resources.',
  'usr_admin_master_001',
  NULL,
  'published',
  'ver_tycoon_02_v1',
  980,
  1,
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
),
(
  'game_arena_03',
  'cyber-drift-arena',
  'Cyber Drift 3D [แข่งรถ]',
  'Physics-driven vehicle arena with custom impulse boosters and matchmaking.',
  'usr_admin_master_001',
  NULL,
  'published',
  'ver_arena_03_v1',
  2150,
  1,
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
);

INSERT OR REPLACE INTO game_versions (
  id,
  game_id,
  version_number,
  changelog,
  bundle_url,
  manifest_json,
  status,
  published_at,
  created_at
) VALUES
(
  'ver_obby_01_v1',
  'game_obby_01',
  'v1.2.0',
  'Initial release of Neon Sky Obby with 60Hz physics and moving platforms.',
  'https://assets-game.lenout.com/bundles/game_obby_01/v1.json',
  '{"title":"Neon Sky Obby","version":"1.2.0","objects":[{"id":"spawn_1","type":"spawn","position":{"x":0,"y":1,"z":0},"scale":{"x":2,"y":0.2,"z":2},"color":"#38bdf8"}]}',
  'published',
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
),
(
  'ver_tycoon_02_v1',
  'game_tycoon_02',
  'v1.0.4',
  'Initial release of Starforge Tycoon with modular stations.',
  'https://assets-game.lenout.com/bundles/game_tycoon_02/v1.json',
  '{"title":"Starforge Tycoon","version":"1.0.4","objects":[{"id":"spawn_2","type":"spawn","position":{"x":0,"y":1,"z":0},"scale":{"x":2,"y":0.2,"z":2},"color":"#818cf8"}]}',
  'published',
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
),
(
  'ver_arena_03_v1',
  'game_arena_03',
  'v1.1.0',
  'Initial release of Cyber Drift 3D with impulse pads.',
  'https://assets-game.lenout.com/bundles/game_arena_03/v1.json',
  '{"title":"Cyber Drift 3D","version":"1.1.0","objects":[{"id":"spawn_3","type":"spawn","position":{"x":0,"y":1,"z":0},"scale":{"x":2,"y":0.2,"z":2},"color":"#10b981"}]}',
  'published',
  '2026-11-08T00:00:00.000Z',
  '2026-11-08T00:00:00.000Z'
);
