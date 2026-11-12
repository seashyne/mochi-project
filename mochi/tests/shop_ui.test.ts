// Unit tests for Mochi Avatar Shop UI Components, Wallet, and Empty State

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ShopItemCard } from '../src/components/shop/ShopItemCard';
import { WalletModal } from '../src/components/shop/WalletModal';
import { ShopItem } from '../src/api/shopTypes';

describe('Avatar Shop UI Components Suite', () => {
  const sampleHat: ShopItem = {
    id: 'hat_neon_beanie',
    creatorId: 'usr_creator_01',
    slot: 'hat',
    name: 'Neon Beanie',
    description: 'Warm glowing cyber knit beanie',
    price: 50,
    status: 'approved',
    sales: 10,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z'
  };

  const sampleFreeShirt: ShopItem = {
    id: 'shirt_starter_tee',
    creatorId: 'usr_admin',
    slot: 'shirt',
    name: 'Starter Tee',
    description: 'Default cotton t-shirt',
    price: 0,
    status: 'approved',
    sales: 100,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z'
  };

  it('renders ShopItemCard with slot badge, name, and price in MC', () => {
    const onBuy = vi.fn();
    const html = renderToString(
      React.createElement(ShopItemCard, {
        item: sampleHat,
        isOwned: false,
        onBuy
      })
    );

    expect(html).toContain('Neon Beanie');
    expect(html).toContain('50 MC');
    expect(html).toContain('hat');
    expect(html).toContain('data-testid="shop-item-hat_neon_beanie"');
    expect(html).toContain('Buy');
    expect(html).not.toContain('Owned');
  });

  it('renders Free badge and "Get Free" button when item price is 0', () => {
    const onBuy = vi.fn();
    const html = renderToString(
      React.createElement(ShopItemCard, {
        item: sampleFreeShirt,
        isOwned: false,
        onBuy
      })
    );

    expect(html).toContain('Starter Tee');
    expect(html).toContain('Free');
    expect(html).toContain('Get Free');
  });

  it('renders Owned badge and Equip button when player owns the item', () => {
    const onBuy = vi.fn();
    const onEquip = vi.fn();
    const html = renderToString(
      React.createElement(ShopItemCard, {
        item: sampleHat,
        isOwned: true,
        isEquipped: false,
        onBuy,
        onEquip
      })
    );

    expect(html).toContain('Owned');
    expect(html).toContain('Equip');
    expect(html).not.toContain('Buy');
  });

  it('renders WalletModal with balance and creator revenue', () => {
    const onClose = vi.fn();
    const html = renderToString(
      React.createElement(WalletModal, {
        isOpen: true,
        onClose,
        initialBalance: 250
      })
    );

    expect(html).toContain('Mochi Wallet');
    expect(html).toContain('250 MC');
    expect(html).toContain('Total Balance');
    expect(html).toContain('Creator Revenue');
    expect(html).toContain('data-testid="wallet-modal"');
  });
});
