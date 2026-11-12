// Shop HTTP endpoints for Mochi Coins, cosmetic purchases, and inventory

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import {
  listShopItems,
  getShopItemById,
  purchaseShopItem,
  getUserInventory,
  createShopItem
} from '../services/shopDb';
import { getOrCreateWallet, getLedgerEntries } from '../services/walletDb';
import { CosmeticSlot, isValidSlot } from '../models/shop';

export const shopRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// GET /api/v1/shop/items - Public shop catalog
shopRouter.get('/items', async (c) => {
  const slot = c.req.query('slot');
  const query = c.req.query('q');
  const sort = c.req.query('sort') as 'popular' | 'newest' | 'price_asc' | 'price_desc' | undefined;
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const items = await listShopItems(c.env.DB, {
    slot: slot && isValidSlot(slot) ? (slot as CosmeticSlot) : undefined,
    query,
    sort,
    limit: Number.isFinite(limit) ? limit : undefined
  });

  return c.json({ success: true, items }, 200);
});

// GET /api/v1/shop/items/:id - Specific shop item details
shopRouter.get('/items/:id', async (c) => {
  const id = c.req.param('id');
  const item = await getShopItemById(c.env.DB, id);
  if (!item) {
    return c.json({ error: 'Shop item not found' }, 404);
  }
  return c.json({ success: true, item }, 200);
});

// POST /api/v1/shop/items/:id/buy - Purchase cosmetic item with Mochi Coins
shopRouter.post('/items/:id/buy', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const itemId = c.req.param('id');
  if (!itemId) {
    return c.json({ error: 'Item ID is required' }, 400);
  }
  try {
    const result = await purchaseShopItem(c.env.DB, user.id, itemId);
    return c.json({
      success: true,
      inventoryItem: result.inventoryItem,
      balance: result.balance
    }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Purchase failed';
    const status = message.includes('Insufficient') ? 402 : message.includes('already owned') ? 409 : 400;
    return c.json({ error: message }, status);
  }
});

// GET /api/v1/shop/inventory - Authenticated user inventory
shopRouter.get('/inventory', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const inventory = await getUserInventory(c.env.DB, user.id);
  return c.json({ success: true, inventory }, 200);
});

// GET /api/v1/shop/wallet - Authenticated user wallet balance
shopRouter.get('/wallet', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const wallet = await getOrCreateWallet(c.env.DB, user.id);
  return c.json({ success: true, wallet }, 200);
});

// GET /api/v1/shop/wallet/ledger - Authenticated user coin transaction history
shopRouter.get('/wallet/ledger', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ledger = await getLedgerEntries(c.env.DB, user.id);
  return c.json({ success: true, ledger }, 200);
});

// POST /api/v1/shop/items - Creator item upload / submission
shopRouter.post('/items', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    slot?: string;
    name?: string;
    description?: string;
    price?: number;
    assetKey?: string;
    thumbKey?: string;
  };

  if (!body.slot || !isValidSlot(body.slot)) {
    return c.json({ error: 'Invalid cosmetic slot' }, 400);
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Item name is required' }, 400);
  }

  const price = typeof body.price === 'number' && body.price >= 0 ? Math.floor(body.price) : 0;
  const itemId = `${body.slot}_${crypto.randomUUID().slice(0, 10)}`;
  const status = user.role === 'admin' ? 'approved' : 'approved'; // Approved by default in initial phase

  const created = await createShopItem(c.env.DB, {
    id: itemId,
    creatorId: user.id,
    slot: body.slot as CosmeticSlot,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    price,
    status,
    assetKey: body.assetKey || null,
    thumbKey: body.thumbKey || null
  });

  return c.json({ success: true, item: created }, 201);
});
