// Mochi Avatar Shop Page with Category Filters, Search, Empty State, and Purchase Dialog

import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Search, Filter, RefreshCw, AlertCircle, Coins, Check } from 'lucide-react';
import { ShopItem, CosmeticSlot, InventoryItem } from '../../api/shopTypes';
import { shopApi } from '../../api/shop';
import { useAuthStore } from '../../store/useAuthStore';
import { useAvatarStore } from '../../store/useAvatarStore';
import { isEquipped, resolveEquippable } from '../../lib/avatarEquip';
import { ShopItemCard } from './ShopItemCard';
import { WalletModal } from './WalletModal';

const CATEGORIES: { id: 'all' | CosmeticSlot; label: string }[] = [
  { id: 'all', label: 'All Items' },
  { id: 'hat', label: 'Hats' },
  { id: 'shirt', label: 'Shirts' },
  { id: 'pants', label: 'Pants' },
  { id: 'face', label: 'Faces' },
  { id: 'hair', label: 'Hair' },
  { id: 'back', label: 'Back' },
  { id: 'emote', label: 'Emotes' }
];

export interface ShopPageProps {
  onOpenAuth?: () => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onOpenAuth }) => {
  const { user, token } = useAuthStore();
  const avatar = useAvatarStore((state) => state.avatar);
  const catalog = useAvatarStore((state) => state.catalog);
  const saveAvatar = useAvatarStore((state) => state.save);
  const [selectedSlot, setSelectedSlot] = useState<'all' | CosmeticSlot>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'price_asc' | 'price_desc'>('popular');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [selectedBuyItem, setSelectedBuyItem] = useState<ShopItem | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const fetchShopData = useCallback(async () => {
    setLoading(true);
    try {
      const shopItems = await shopApi.listItems({
        slot: selectedSlot === 'all' ? undefined : selectedSlot,
        q: searchQuery.trim() || undefined,
        sort: sortBy
      });
      setItems(shopItems);

      if (token) {
        const inv = await shopApi.getInventory(token);
        setInventory(inv);
      }
    } catch {
      // Retain previous or empty list
    } finally {
      setLoading(false);
    }
  }, [selectedSlot, searchQuery, sortBy, token]);

  useEffect(() => {
    void fetchShopData();
  }, [fetchShopData]);

  const ownedItemIds = new Set(inventory.map((i) => i.itemId));

  const handleBuyClick = (item: ShopItem) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    setPurchaseError(null);
    setPurchaseNotice(null);
    setSelectedBuyItem(item);
  };

  const handleEquip = async (item: ShopItem) => {
    const accessory = resolveEquippable(item, catalog);
    if (!accessory) return;
    const equipped = isEquipped(avatar, accessory);
    const nextId = equipped ? '' : accessory.id;
    const ok = await saveAvatar(accessory.field === 'hatId' ? { hatId: nextId } : { shirtId: nextId });
    if (ok) setPurchaseNotice(equipped ? `Unequipped ${item.name}` : `Equipped ${item.name}`);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedBuyItem || !token) return;
    setIsPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await shopApi.buyItem(selectedBuyItem.id, token);
      setInventory((prev) => [res.inventoryItem, ...prev]);
      setPurchaseNotice(`Purchased ${selectedBuyItem.name} successfully!`);
      setSelectedBuyItem(null);
      void fetchShopData();
    } catch (err: unknown) {
      setPurchaseError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div data-testid="shop-page" className="mochi-page">
      {/* Shop Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="mochi-icon-badge">
            <ShoppingBag className="w-5 h-5" />
          </span>
          <div>
            <h1 className="mochi-page-title">Avatar Shop</h1>
            <p className="mochi-page-sub">Customize your 3D avatar with creator and platform gear</p>
          </div>
        </div>

        {/* Action / Wallet Chip */}
        <div className="flex items-center gap-2.5">
          {user && (
            <button
              type="button"
              onClick={() => setIsWalletOpen(true)}
              className="mochi-chip font-mono text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 transition-colors"
            >
              <Coins className="w-4 h-4 text-amber-500" />
              <span>Wallet & Ledger</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void fetchShopData()}
            title="Refresh Catalog"
            className="mochi-btn-ghost p-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success banner */}
      {purchaseNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{purchaseNotice}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search avatar accessories, hats, shirts, gear..."
            className="mochi-input-soft pl-10"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="mochi-input-soft w-auto"
          >
            <option value="popular">Most Popular</option>
            <option value="newest">Newest Releases</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedSlot === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedSlot(cat.id)}
              data-active={isSelected}
              className="mochi-tab whitespace-nowrap"
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Item Grid / Empty State */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="mochi-card-soft h-64 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          data-testid="shop-empty-state"
          className="mochi-empty space-y-4"
        >
          <div className="mochi-icon-badge mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[color:var(--mochi-text)]">No Items Available Yet</h3>
            <p className="mochi-page-sub mx-auto">
              The shop catalog is currently empty. Cosmetic accessories published by creators and the platform will appear here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchShopData()}
            className="mochi-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Refresh Shop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => {
            const accessory = resolveEquippable(item, catalog);
            return (
              <ShopItemCard
                key={item.id}
                item={item}
                isOwned={ownedItemIds.has(item.id)}
                isEquipped={isEquipped(avatar, accessory)}
                onBuy={handleBuyClick}
                onEquip={accessory ? handleEquip : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Buy Confirmation Modal */}
      {selectedBuyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-sm bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Purchase</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to purchase{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{selectedBuyItem.name}</span> for{' '}
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {selectedBuyItem.price === 0 ? 'Free' : `${selectedBuyItem.price} MC`}
              </span>
              ?
            </p>

            {purchaseError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{purchaseError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedBuyItem(null)}
                className="mochi-btn-secondary flex-1 py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPurchase()}
                disabled={isPurchasing}
                className="mochi-btn-primary flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {isPurchasing ? 'Purchasing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletModal
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        token={token || undefined}
        initialBalance={user?.coins ?? 100}
      />
    </div>
  );
};
