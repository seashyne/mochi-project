// Inventory page: owned cosmetics with equip and unequip wired to the avatar store

import React, { useState } from 'react';
import { Package, ShoppingBag } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { useI18n } from '../i18n/context';
import { useInventory } from '../hooks/useInventory';
import { useAvatarStore } from '../store/useAvatarStore';
import { isEquipped, resolveEquippable } from '../lib/avatarEquip';
import { InventoryItem } from '../api/shopTypes';

export interface InventoryPageProps {
  onGoShop?: () => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ onGoShop }) => {
  const { t } = useI18n();
  const p = t.pages;
  const { items, isLoading, failed, refresh } = useInventory();
  const avatar = useAvatarStore((state) => state.avatar);
  const catalog = useAvatarStore((state) => state.catalog);
  const save = useAvatarStore((state) => state.save);
  const isSaving = useAvatarStore((state) => state.isSaving);
  const [notice, setNotice] = useState<string | null>(null);

  const handleToggle = async (entry: InventoryItem) => {
    const accessory = resolveEquippable(entry.item, catalog);
    if (!accessory) {
      setNotice(p.inventoryFailed);
      return;
    }
    const equipped = isEquipped(avatar, accessory);
    const nextId = equipped ? '' : accessory.id;
    const ok = await save(accessory.field === 'hatId' ? { hatId: nextId } : { shirtId: nextId });
    setNotice(ok ? (equipped ? p.unequip : p.equipped) : p.inventoryFailed);
  };

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI // COLLECTION"
        title={p.inventoryTitle}
        subtitle={p.inventorySubtitle}
        icon={Package}
        badge={<span className="mochi-chip">{items.length}</span>}
        actions={
          onGoShop ? (
            <button
              type="button"
              onClick={onGoShop}
              className="mochi-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{p.goToShop}</span>
            </button>
          ) : undefined
        }
      />

      {notice && <p className="mochi-meta">{notice}</p>}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="mochi-card-soft h-32 animate-pulse" />
          ))}
        </div>
      ) : failed ? (
        <PageEmpty
          icon={Package}
          title={p.inventoryFailed}
          action={
            <button
              type="button"
              onClick={() => void refresh()}
              className="mochi-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
            >
              {p.retry}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <PageEmpty
          icon={Package}
          title={p.inventoryEmpty}
          hint={p.inventorySubtitle}
          action={
            onGoShop ? (
              <button
                type="button"
                onClick={onGoShop}
                className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{p.goToShop}</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((entry) => {
            const item = entry.item;
            const accessory = resolveEquippable(item, catalog);
            const equipped = isEquipped(avatar, accessory);
            return (
              <div key={entry.itemId} className="mochi-card-soft flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[color:var(--mochi-text)]">
                      {item?.name || entry.itemId}
                    </p>
                    <p className="mochi-meta">{item?.slot || 'item'}</p>
                  </div>
                  <span className={`mochi-chip ${equipped ? '' : 'mochi-chip-muted'}`}>
                    {equipped ? p.equipped : p.equip}
                  </span>
                </div>
                <p className="text-xs text-[color:var(--mochi-text-sub)] line-clamp-2 min-h-[2rem]">
                  {item?.description || p.inventorySubtitle}
                </p>
                <button
                  type="button"
                  disabled={!accessory || isSaving}
                  onClick={() => void handleToggle(entry)}
                  className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    equipped ? 'mochi-btn-secondary' : 'mochi-btn-primary'
                  } disabled:opacity-40`}
                >
                  {equipped ? p.unequip : p.equip}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
