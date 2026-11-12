// Shop, Wallet, Ledger, and Cosmetic Inventory Types for Mochi Client

export type CosmeticSlot = 'hat' | 'shirt' | 'pants' | 'face' | 'hair' | 'back' | 'emote';

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  hat: 'Hats',
  shirt: 'Shirts',
  pants: 'Pants',
  face: 'Faces',
  hair: 'Hair',
  back: 'Back Accessories',
  emote: 'Emotes'
};

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

export interface Wallet {
  userId: string;
  balance: number;
  earnedBalance: number;
  updatedAt: string;
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

export interface InventoryItem {
  userId: string;
  itemId: string;
  acquiredAt: string;
  pricePaid: number;
  item?: ShopItem;
}

export interface ListShopItemsParams {
  slot?: CosmeticSlot | string;
  q?: string;
  sort?: 'popular' | 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
}
