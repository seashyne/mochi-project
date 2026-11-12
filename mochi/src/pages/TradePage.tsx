// Trade page: draft local trade offers from owned inventory and track their status

import React, { useState } from 'react';
import { ArrowLeftRight, Check, Package, Users, X } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { useI18n } from '../i18n/context';
import { useInventory } from '../hooks/useInventory';
import { useSocialStore, TradeStatus } from '../store/useSocialStore';

export interface TradePageProps {
  onGoShop?: () => void;
  onOpenFriends?: () => void;
}

const STATUS_STYLES: Record<TradeStatus, string> = {
  open: 'mochi-chip',
  completed: 'mochi-chip text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
  cancelled: 'mochi-chip-muted mochi-chip'
};

export const TradePage: React.FC<TradePageProps> = ({ onGoShop, onOpenFriends }) => {
  const { t } = useI18n();
  const p = t.pages;
  const { items } = useInventory();
  const friends = useSocialStore((state) => state.friends);
  const offers = useSocialStore((state) => state.offers);
  const createOffer = useSocialStore((state) => state.createOffer);
  const setOfferStatus = useSocialStore((state) => state.setOfferStatus);

  const [itemId, setItemId] = useState('');
  const [friendName, setFriendName] = useState('');
  const [note, setNote] = useState('');

  const statusLabel = (status: TradeStatus) =>
    status === 'completed' ? p.statusCompleted : status === 'cancelled' ? p.statusCancelled : p.statusOpen;

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const selected = items.find((entry) => entry.itemId === itemId);
    if (!selected || !friendName) return;
    createOffer(selected.itemId, selected.item?.name || selected.itemId, friendName, note);
    setItemId('');
    setNote('');
  };

  const canTrade = items.length > 0 && friends.length > 0;

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI // ECONOMY"
        title={p.tradeTitle}
        subtitle={p.tradeSubtitle}
        icon={ArrowLeftRight}
        badge={<span className="mochi-chip">{offers.length}</span>}
      />

      <form onSubmit={handleCreate} className="mochi-panel grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-[color:var(--mochi-text-sub)]">
          <span>{p.tradeItem}</span>
          <select
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            className="mochi-input-soft"
            disabled={items.length === 0}
          >
            <option value="">{p.tradeItem}</option>
            {items.map((entry) => (
              <option key={entry.itemId} value={entry.itemId}>
                {entry.item?.name || entry.itemId}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[color:var(--mochi-text-sub)]">
          <span>{p.tradeFriend}</span>
          <select
            value={friendName}
            onChange={(event) => setFriendName(event.target.value)}
            className="mochi-input-soft"
            disabled={friends.length === 0}
          >
            <option value="">{p.tradeFriend}</option>
            {friends.map((friend) => (
              <option key={friend.id} value={friend.name}>
                {friend.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[color:var(--mochi-text-sub)] sm:col-span-2">
          <span>{p.tradeNote}</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={p.tradeNotePlaceholder}
            className="mochi-input-soft"
          />
        </label>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!canTrade || !itemId || !friendName}
            className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>{p.createOffer}</span>
          </button>
          {items.length === 0 && onGoShop && (
            <button type="button" onClick={onGoShop} className="mochi-btn-ghost inline-flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span>{p.goToShop}</span>
            </button>
          )}
          {friends.length === 0 && onOpenFriends && (
            <button type="button" onClick={onOpenFriends} className="mochi-btn-ghost inline-flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{p.friendsTitle}</span>
            </button>
          )}
        </div>
      </form>

      {items.length === 0 && <p className="mochi-meta">{p.tradeNoInventory}</p>}

      {offers.length === 0 ? (
        <PageEmpty icon={ArrowLeftRight} title={p.tradeEmpty} hint={p.localOnly} />
      ) : (
        <div className="mochi-list">
          {offers.map((offer) => (
            <div key={offer.id} className="mochi-row">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[color:var(--mochi-text)] truncate">
                  {offer.itemName} to {offer.toName}
                </p>
                <p className="text-[11px] text-[color:var(--mochi-text-muted)] truncate">
                  {offer.note || p.tradeNotePlaceholder}
                </p>
              </div>
              <span className={STATUS_STYLES[offer.status]}>{statusLabel(offer.status)}</span>
              {offer.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => setOfferStatus(offer.id, 'cancelled')}
                  className="mochi-btn-ghost inline-flex items-center gap-1 text-rose-500"
                  title={p.cancel}
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{p.cancel}</span>
                </button>
              ) : (
                <Check className="w-4 h-4 text-emerald-500" />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mochi-meta">{p.localOnly}</p>
    </div>
  );
};

export default TradePage;
