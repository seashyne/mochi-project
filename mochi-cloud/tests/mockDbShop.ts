// Mock D1 Database Handler for Wallets, Coin Ledger, Shop Items, and Inventory

export interface StoredWallet {
  user_id: string;
  balance: number;
  earned_balance: number;
  updated_at: string;
}

export interface StoredCoinLedger {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export interface StoredShopItem {
  id: string;
  creator_id: string;
  slot: string;
  name: string;
  description: string | null;
  price: number;
  status: string;
  asset_key: string | null;
  thumb_key: string | null;
  sales: number;
  created_at: string;
  updated_at: string;
}

export interface StoredInventory {
  user_id: string;
  item_id: string;
  acquired_at: string;
  price_paid: number;
}

export interface ShopMockCols {
  wallets: Map<string, StoredWallet>;
  ledger: StoredCoinLedger[];
  shopItems: Map<string, StoredShopItem>;
  inventory: Map<string, StoredInventory>;
}

export function handleShopMockSelect<T>(
  q: string,
  boundParams: unknown[],
  cols: ShopMockCols
): T[] | null {
  if (q.includes('FROM wallets WHERE user_id = ?')) {
    const w = cols.wallets.get(String(boundParams[0]));
    return (w ? [w] : []) as T[];
  }

  if (q.includes('FROM coin_ledger WHERE user_id = ?')) {
    const uid = String(boundParams[0]);
    const list = cols.ledger
      .filter((l) => l.user_id === uid)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list as unknown as T[];
  }

  if (q.includes('FROM shop_items WHERE id = ?')) {
    const item = cols.shopItems.get(String(boundParams[0]));
    return (item ? [item] : []) as T[];
  }

  if (q.includes('FROM shop_items WHERE status = ?')) {
    const status = String(boundParams[0]);
    let list = Array.from(cols.shopItems.values()).filter((i) => i.status === status);

    if (q.includes('AND slot = ?')) {
      const slot = String(boundParams[1]);
      list = list.filter((i) => i.slot === slot);
    }

    if (q.includes('ORDER BY price ASC')) {
      list.sort((a, b) => a.price - b.price);
    } else if (q.includes('ORDER BY price DESC')) {
      list.sort((a, b) => b.price - a.price);
    } else if (q.includes('ORDER BY created_at DESC')) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      list.sort((a, b) => b.sales - a.sales);
    }

    return list as unknown as T[];
  }

  if (q.includes('FROM inventory WHERE user_id = ? AND item_id = ?')) {
    const uid = String(boundParams[0]);
    const iid = String(boundParams[1]);
    const inv = cols.inventory.get(`${uid}:${iid}`);
    return (inv ? [inv] : []) as T[];
  }

  if (q.includes('FROM inventory inv') && q.includes('WHERE inv.user_id = ?')) {
    const uid = String(boundParams[0]);
    const list = Array.from(cols.inventory.values())
      .filter((inv) => inv.user_id === uid)
      .map((inv) => {
        const item = cols.shopItems.get(inv.item_id);
        return {
          user_id: inv.user_id,
          item_id: inv.item_id,
          acquired_at: inv.acquired_at,
          price_paid: inv.price_paid,
          ...(item || {})
        };
      });
    return list as unknown as T[];
  }

  return null;
}

export function handleShopMockMutation(
  q: string,
  boundParams: unknown[],
  cols: ShopMockCols
): boolean {
  if (q.includes('INTO wallets')) {
    const [uid, bal, earned, up] = boundParams as [string, number, number, string];
    if (!cols.wallets.has(uid)) {
      cols.wallets.set(uid, { user_id: uid, balance: bal, earned_balance: earned, updated_at: up });
    }
    return true;
  }

  if (q.startsWith('UPDATE wallets SET balance = ?')) {
    if (q.includes('earned_balance = ?')) {
      const [bal, earned, up, uid] = boundParams as [number, number, string, string];
      const w = cols.wallets.get(uid);
      if (w) { w.balance = bal; w.earned_balance = earned; w.updated_at = up; }
    } else {
      const [bal, up, uid] = boundParams as [number, string, string];
      const w = cols.wallets.get(uid);
      if (w) { w.balance = bal; w.updated_at = up; }
    }
    return true;
  }

  if (q.includes('INTO coin_ledger')) {
    const [id, uid, delta, balAfter, reason, refId, createdAt] = boundParams as [string, string, number, number, string, string | null, string];
    cols.ledger.push({
      id,
      user_id: uid,
      delta,
      balance_after: balAfter,
      reason,
      ref_id: refId,
      created_at: createdAt
    });
    return true;
  }

  if (q.includes('INTO shop_items')) {
    const [id, creator_id, slot, name, desc, price, status, aKey, tKey, sales, cAt, uAt] = boundParams as [string, string, string, string, string | null, number, string, string | null, string | null, number, string, string];
    cols.shopItems.set(id, {
      id,
      creator_id,
      slot,
      name,
      description: desc,
      price,
      status,
      asset_key: aKey,
      thumb_key: tKey,
      sales,
      created_at: cAt,
      updated_at: uAt
    });
    return true;
  }

  if (q.startsWith('UPDATE shop_items SET sales = sales + 1')) {
    const id = String(boundParams[0]);
    const item = cols.shopItems.get(id);
    if (item) { item.sales += 1; }
    return true;
  }

  if (q.includes('INTO inventory')) {
    const [uid, iid, acquiredAt, pricePaid] = boundParams as [string, string, string, number];
    cols.inventory.set(`${uid}:${iid}`, {
      user_id: uid,
      item_id: iid,
      acquired_at: acquiredAt,
      price_paid: pricePaid
    });
    return true;
  }

  return false;
}
