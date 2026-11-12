-- Migration 0012: Starter avatar shop catalog
-- Seeds the twelve curated accessories from AVATAR_CATALOG so the shop is browsable
-- and every purchased item maps onto an equippable avatar accessory id.

INSERT OR IGNORE INTO shop_items
  (id, creator_id, slot, name, description, price, status, asset_key, thumb_key, sales, created_at, updated_at)
VALUES
  ('hat_cyber_beanie', 'usr_admin_master_001', 'hat', 'Cyber Beanie',
   'Soft knit beanie with a glowing cyan trim. Pairs with late-night studio sessions.',
   40, 'approved', 'hat_cyber_beanie', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('hat_cap_classic', 'usr_admin_master_001', 'hat', 'Classic Cap',
   'Everyday baseball cap in warm red. A safe pick for any outfit.',
   25, 'approved', 'hat_cap_classic', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('hat_crown_royal', 'usr_admin_master_001', 'hat', 'Royal Crown',
   'A golden crown for creators who have earned their throne.',
   120, 'approved', 'hat_crown_royal', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('hat_halo_neon', 'usr_admin_master_001', 'hat', 'Neon Halo',
   'Floating lime halo that hums quietly above your head.',
   90, 'approved', 'hat_halo_neon', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('hat_horns_imp', 'usr_admin_master_001', 'hat', 'Imp Horns',
   'Two little horns for players who like a bit of chaos.',
   35, 'approved', 'hat_horns_imp', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('hat_bucket_studio', 'usr_admin_master_001', 'hat', 'Studio Bucket',
   'Relaxed bucket hat in violet, made for long build sessions.',
   30, 'approved', 'hat_bucket_studio', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_tee_plain', 'usr_admin_master_001', 'shirt', 'Plain Tee',
   'Free starter t-shirt. Every Mochi avatar begins here.',
   0, 'approved', 'shirt_tee_plain', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_space_cadet', 'usr_admin_master_001', 'shirt', 'Space Cadet',
   'Light utility shirt with a small mission patch on the chest.',
   30, 'approved', 'shirt_space_cadet', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_stripes_racer', 'usr_admin_master_001', 'shirt', 'Racer Stripes',
   'Two crisp racing stripes across a bright base layer.',
   45, 'approved', 'shirt_stripes_racer', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_hoodie_zip', 'usr_admin_master_001', 'shirt', 'Zip Hoodie',
   'Heavy slate hoodie with the hood resting on your shoulders.',
   60, 'approved', 'shirt_hoodie_zip', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_vest_tech', 'usr_admin_master_001', 'shirt', 'Tech Vest',
   'Open-sleeve technical vest in sky blue.',
   50, 'approved', 'shirt_vest_tech', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('shirt_jacket_denim', 'usr_admin_master_001', 'shirt', 'Denim Jacket',
   'Classic denim with a structured collar. Never goes out of style.',
   75, 'approved', 'shirt_jacket_denim', NULL, 0, '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z');
