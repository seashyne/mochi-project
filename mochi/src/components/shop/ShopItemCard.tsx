// Shop Item Grid Card with Slot Badge, Price in MC, and Try-On/Purchase Actions

import React from 'react';
import { Coins, Check, Sparkles, Shirt } from 'lucide-react';
import { ShopItem, CosmeticSlot } from '../../api/shopTypes';

export interface ShopItemCardProps {
  item: ShopItem;
  isOwned: boolean;
  isEquipped?: boolean;
  onBuy: (item: ShopItem) => void;
  onTryOn?: (item: ShopItem) => void;
  onEquip?: (item: ShopItem) => void;
}

const SLOT_COLORS: Record<CosmeticSlot, string> = {
  hat: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/25 dark:text-cyan-300',
  shirt: 'bg-blue-500/10 text-blue-600 border-blue-500/25 dark:text-blue-300',
  pants: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/25 dark:text-indigo-300',
  face: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-300',
  hair: 'bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-300',
  back: 'bg-purple-500/10 text-purple-600 border-purple-500/25 dark:text-purple-300',
  emote: 'bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-300'
};

export const ShopItemCard: React.FC<ShopItemCardProps> = ({
  item,
  isOwned,
  isEquipped,
  onBuy,
  onTryOn,
  onEquip
}) => {
  const badgeClass = SLOT_COLORS[item.slot] || 'bg-slate-500/10 text-slate-500 border-slate-500/25';

  return (
    <div
      data-testid={`shop-item-${item.id}`}
      className="group relative flex flex-col bg-white dark:bg-[#11161f] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-sky-400/50 transition-all duration-200 shadow-sm dark:shadow-lg"
    >
      {/* Thumbnail or 3D placeholder */}
      <div className="relative w-full aspect-square rounded-xl bg-slate-100 dark:bg-[#090b10] border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center overflow-hidden mb-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-400/15 to-indigo-500/15 border border-sky-400/25 flex items-center justify-center text-sky-500 dark:text-sky-400 group-hover:scale-105 transition-transform duration-200">
          <Shirt className="w-8 h-8" />
        </div>

        {/* Slot tag */}
        <span
          className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${badgeClass}`}
        >
          {item.slot}
        </span>

        {/* Owned indicator */}
        {isOwned && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
            <Check className="w-3 h-3" />
            <span>Owned</span>
          </span>
        )}
      </div>

      {/* Item info */}
      <div className="flex-1 space-y-1 mb-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate" title={item.name}>
          {item.name}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {item.description || 'Custom avatar accessory created for Mochi players.'}
        </p>
      </div>

      {/* Price and actions */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
          <Coins className="w-4 h-4 shrink-0" />
          <span>{item.price === 0 ? 'Free' : `${item.price} MC`}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onTryOn && (
            <button
              type="button"
              onClick={() => onTryOn(item)}
              title="Try On 3D"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
            </button>
          )}

          {isOwned ? (
            onEquip && (
              <button
                type="button"
                onClick={() => onEquip(item)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isEquipped
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                }`}
              >
                {isEquipped ? 'Equipped' : 'Equip'}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => onBuy(item)}
              data-testid={`buy-btn-${item.id}`}
              className="mochi-btn-primary px-3.5 py-1.5 rounded-lg text-xs font-bold"
            >
              {item.price === 0 ? 'Get Free' : 'Buy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
