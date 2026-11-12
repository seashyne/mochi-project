// Shop and Inventory Database Operations with Revenue Sharing and Ownership Checks

import {
  ShopItem,
  ShopItemRow,
  InventoryItem,
  InventoryRow,
  mapShopItemRow,
  mapInventoryRow,
  CosmeticSlot
} from '../models/shop';
import { debitCoins, creditCoins, getOrCreateWallet } from './walletDb';

export interface ListShopOptions {
  slot?: CosmeticSlot | string;
  status?: string;
  query?: string;
  sort?: 'popular' | 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
}

export async function listShopItems(db: D1Database, options: ListShopOptions = {}): Promise<ShopItem[]> {
  const status = options.status || 'approved';
  const limit = Math.min(Math.max(options.limit || 30, 1), 60);

  let sql = 'SELECT * FROM shop_items WHERE status = ?';
  const bindings: unknown[] = [status];

  if (options.slot) {
    sql += ' AND slot = ?';
    bindings.push(options.slot);
  }

  if (options.query && options.query.trim().length > 0) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    const pattern = `%${options.query.trim()}%`;
    bindings.push(pattern, pattern);
  }

  if (options.sort === 'newest') {
    sql += ' ORDER BY created_at DESC';
  } else if (options.sort === 'price_asc') {
    sql += ' ORDER BY price ASC, sales DESC';
  } else if (options.sort === 'price_desc') {
    sql += ' ORDER BY price DESC, sales DESC';
  } else {
    // Default: popular (sales DESC)
    sql += ' ORDER BY sales DESC, created_at DESC';
  }

  sql += ' LIMIT ?';
  bindings.push(limit);

  const res = await db.prepare(sql).bind(...bindings).all<ShopItemRow>();
  return (res.results || []).map(mapShopItemRow);
}

export async function getShopItemById(db: D1Database, id: string): Promise<ShopItem | null> {
  const row = await db
    .prepare('SELECT * FROM shop_items WHERE id = ? LIMIT 1')
    .bind(id)
    .first<ShopItemRow>();
  return row ? mapShopItemRow(row) : null;
}

export async function isItemOwned(db: D1Database, userId: string, itemId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT user_id FROM inventory WHERE user_id = ? AND item_id = ? LIMIT 1')
    .bind(userId, itemId)
    .first();
  return Boolean(row);
}

export async function getUserInventory(db: D1Database, userId: string): Promise<InventoryItem[]> {
  const rows = await db
    .prepare(
      `SELECT inv.user_id, inv.item_id, inv.acquired_at, inv.price_paid,
              s.creator_id, s.slot, s.name, s.description, s.price, s.status, s.asset_key, s.thumb_key, s.sales, s.created_at, s.updated_at
       FROM inventory inv
       LEFT JOIN shop_items s ON inv.item_id = s.id
       WHERE inv.user_id = ?
       ORDER BY inv.acquired_at DESC`
    )
    .bind(userId)
    .all<InventoryRow & Partial<ShopItemRow>>();

  return (rows.results || []).map((r) => {
    const inv = mapInventoryRow(r);
    if (r.name && r.slot) {
      inv.item = mapShopItemRow(r as ShopItemRow);
    }
    return inv;
  });
}

export async function purchaseShopItem(
  db: D1Database,
  userId: string,
  itemId: string
): Promise<{ inventoryItem: InventoryItem; balance: number }> {
  const item = await getShopItemById(db, itemId);
  if (!item) {
    throw new Error('Item not found in shop');
  }
  if (item.status !== 'approved') {
    throw new Error('Item is not available for purchase');
  }

  const alreadyOwned = await isItemOwned(db, userId, itemId);
  if (alreadyOwned) {
    throw new Error('Item is already owned in your inventory');
  }

  const now = new Date().toISOString();
  let updatedBalance = 0;

  if (item.price > 0) {
    const debitResult = await debitCoins(
      db,
      userId,
      item.price,
      `Shop Purchase: ${item.name}`,
      item.id
    );
    updatedBalance = debitResult.wallet.balance;

    // Creator revenue share: 70% to creator earned_balance (if not admin/self)
    if (item.creatorId && item.creatorId !== userId && !item.creatorId.includes('admin')) {
      const creatorShare = Math.floor(item.price * 0.7);
      if (creatorShare > 0) {
        await creditCoins(
          db,
          item.creatorId,
          creatorShare,
          `UGC Revenue Share: ${item.name}`,
          item.id,
          true
        );
      }
    }
  } else {
    const wallet = await getOrCreateWallet(db, userId);
    updatedBalance = wallet.balance;
  }

  await db
    .prepare(
      'INSERT INTO inventory (user_id, item_id, acquired_at, price_paid) VALUES (?, ?, ?, ?)'
    )
    .bind(userId, itemId, now, item.price)
    .run();

  await db
    .prepare('UPDATE shop_items SET sales = sales + 1 WHERE id = ?')
    .bind(itemId)
    .run();

  const inventoryItem: InventoryItem = {
    userId,
    itemId,
    acquiredAt: now,
    pricePaid: item.price,
    item
  };

  return { inventoryItem, balance: updatedBalance };
}

export async function createShopItem(
  db: D1Database,
  data: Omit<ShopItem, 'sales' | 'createdAt' | 'updatedAt'>
): Promise<ShopItem> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO shop_items (id, creator_id, slot, name, description, price, status, asset_key, thumb_key, sales, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.creatorId,
      data.slot,
      data.name,
      data.description || null,
      data.price,
      data.status,
      data.assetKey || null,
      data.thumbKey || null,
      0,
      now,
      now
    )
    .run();

  return { ...data, sales: 0, createdAt: now, updatedAt: now };
}
