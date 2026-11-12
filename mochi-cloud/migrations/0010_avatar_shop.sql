-- Migration 0010: Avatar Shop, Mochi Coins Wallet Ledger, and Cosmetic Inventory
-- Provides server-authoritative store, wallet balances, immutable coin ledger, and inventory schemas

-- Wallets table for Mochi Coins (MC)
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100,
  earned_balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Immutable audit ledger for every coin credit/debit
CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  created_at TEXT NOT NULL
);

-- Shop cosmetic items catalog (starts empty - no mock data)
CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved',
  asset_key TEXT,
  thumb_key TEXT,
  sales INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- User inventory table for owned items (starts empty - no mock data)
CREATE TABLE IF NOT EXISTS inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  acquired_at TEXT NOT NULL,
  price_paid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);

-- Extend user_avatars with cosmetic slots
ALTER TABLE user_avatars ADD COLUMN pants_id TEXT;
ALTER TABLE user_avatars ADD COLUMN face_id TEXT;
ALTER TABLE user_avatars ADD COLUMN hair_id TEXT;
ALTER TABLE user_avatars ADD COLUMN back_id TEXT;
ALTER TABLE user_avatars ADD COLUMN emote_ids TEXT DEFAULT '[]';

-- Indexes for performant shop catalog queries and user inventory lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_items_slot ON shop_items(slot, status);
CREATE INDEX IF NOT EXISTS idx_shop_items_creator ON shop_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id, acquired_at DESC);
