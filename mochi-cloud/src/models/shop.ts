// Shop, Wallet, Ledger, and Inventory Domain Models and Row Mappers

export type CosmeticSlot = 'hat' | 'shirt' | 'pants' | 'face' | 'hair' | 'back' | 'emote';

export const COSMETIC_SLOTS: readonly CosmeticSlot[] = [
  'hat',
  'shirt',
  'pants',
  'face',
  'hair',
  'back',
  'emote'
] as const;

export type ShopItemStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'delisted';

export interface ShopItem {
  id: string;
  creatorId: string;
  slot: CosmeticSlot;
  name: string;
  description: string | null;
  price: number;
  status: ShopItemStatus;
  assetKey?: string | null;
  thumbKey?: string | null;
  sales: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShopItemRow {
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

export function mapShopItemRow(row: ShopItemRow): ShopItem {
  return {
    id: row.id,
    creatorId: row.creator_id,
    slot: row.slot as CosmeticSlot,
    name: row.name,
    description: row.description,
    price: row.price,
    status: row.status as ShopItemStatus,
    assetKey: row.asset_key,
    thumbKey: row.thumb_key,
    sales: row.sales,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface Wallet {
  userId: string;
  balance: number;
  earnedBalance: number;
  updatedAt: string;
}

export interface WalletRow {
  user_id: string;
  balance: number;
  earned_balance: number;
  updated_at: string;
}

export function mapWalletRow(row: WalletRow): Wallet {
  return {
    userId: row.user_id,
    balance: row.balance,
    earnedBalance: row.earned_balance,
    updatedAt: row.updated_at
  };
}

export interface CoinLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  refId?: string | null;
  createdAt: string;
}

export interface CoinLedgerRow {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export function mapCoinLedgerRow(row: CoinLedgerRow): CoinLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    delta: row.delta,
    balanceAfter: row.balance_after,
    reason: row.reason,
    refId: row.ref_id,
    createdAt: row.created_at
  };
}

export interface InventoryItem {
  userId: string;
  itemId: string;
  acquiredAt: string;
  pricePaid: number;
  item?: ShopItem;
}

export interface InventoryRow {
  user_id: string;
  item_id: string;
  acquired_at: string;
  price_paid: number;
}

export function mapInventoryRow(row: InventoryRow): InventoryItem {
  return {
    userId: row.user_id,
    itemId: row.item_id,
    acquiredAt: row.acquired_at,
    pricePaid: row.price_paid
  };
}

export function isValidSlot(slot: string): slot is CosmeticSlot {
  return (COSMETIC_SLOTS as readonly string[]).includes(slot);
}
