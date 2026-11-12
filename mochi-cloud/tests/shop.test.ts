// Unit and integration test suite for Mochi Avatar Shop, Wallet, and Inventory

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { createShopItem } from '../src/services/shopDb';
import { getOrCreateWallet } from '../src/services/walletDb';

describe('Mochi Avatar Shop & Economy Suite', () => {
  let env: MochiEnv;
  const secret = 'shop-test-secret-key-32-bytes-minimum';
  let buyerToken: string;
  let creatorToken: string;
  let creatorId: string;

  async function registerUser(username: string, email: string) {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password: 'password123',
          displayName: username.toUpperCase()
        })
      },
      env
    );
    expect(regRes.status).toBe(201);

    const otp = await env.DB.prepare(
      'SELECT code FROM email_verification_otps WHERE email = ?'
    )
      .bind(email)
      .first<{ code: string }>();

    const verifyRes = await app.request(
      '/api/v1/auth/verify-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp!.code })
      },
      env
    );
    expect(verifyRes.status).toBe(200);

    const data = (await verifyRes.json()) as { token: string; user: { id: string } };
    return { token: data.token, id: data.user.id };
  }

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: secret
    };

    const buyer = await registerUser('playerone', 'playerone@mochi.test');
    buyerToken = buyer.token;

    const creator = await registerUser('creatorpro', 'creatorpro@mochi.test');
    creatorToken = creator.token;
    creatorId = creator.id;
  });

  it('starts with an empty shop catalog when no mock items are preloaded', async () => {
    const res = await app.request('/api/v1/shop/items', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; items: unknown[] };
    expect(data.success).toBe(true);
    expect(data.items).toEqual([]);
  });

  it('creates a wallet with starter balance and ledger history on first access', async () => {
    const res = await app.request(
      '/api/v1/shop/wallet',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; wallet: { balance: number; earnedBalance: number } };
    expect(data.wallet.balance).toBe(100);
    expect(data.wallet.earnedBalance).toBe(0);

    const ledgerRes = await app.request(
      '/api/v1/shop/wallet/ledger',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(ledgerRes.status).toBe(200);
    const ledgerData = (await ledgerRes.json()) as { success: boolean; ledger: { delta: number }[] };
    expect(ledgerData.ledger.length).toBeGreaterThanOrEqual(1);
    expect(ledgerData.ledger[0].delta).toBe(100);
  });

  it('allows creators to add new items and lists them by slot', async () => {
    const createRes = await app.request(
      '/api/v1/shop/items',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creatorToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slot: 'hat',
          name: 'Cyber Fedora',
          description: 'Holographic brim with neon trim',
          price: 50
        })
      },
      env
    );
    expect(createRes.status).toBe(201);
    const itemData = (await createRes.json()) as { success: boolean; item: { id: string; slot: string } };
    expect(itemData.item.slot).toBe('hat');

    const listRes = await app.request('/api/v1/shop/items?slot=hat', { method: 'GET' }, env);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as { success: boolean; items: { name: string }[] };
    expect(listData.items.length).toBe(1);
    expect(listData.items[0].name).toBe('Cyber Fedora');
  });

  it('handles item purchasing, debits buyer, and credits creator revenue share', async () => {
    const item = await createShopItem(env.DB, {
      id: 'hat_cyber_fedora_01',
      creatorId,
      slot: 'hat',
      name: 'Cyber Fedora',
      description: 'Cool fedora',
      price: 50,
      status: 'approved'
    });

    const buyRes = await app.request(
      `/api/v1/shop/items/${item.id}/buy`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(buyRes.status).toBe(200);
    const buyData = (await buyRes.json()) as { success: boolean; balance: number };
    expect(buyData.balance).toBe(50); // 100 - 50 = 50

    // Verify creator received 70% revenue share (35 MC)
    const creatorWallet = await getOrCreateWallet(env.DB, creatorId);
    expect(creatorWallet.earnedBalance).toBe(35);

    // Verify buyer inventory now includes the item
    const invRes = await app.request(
      '/api/v1/shop/inventory',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(invRes.status).toBe(200);
    const invData = (await invRes.json()) as { success: boolean; inventory: { itemId: string }[] };
    expect(invData.inventory.some((i) => i.itemId === item.id)).toBe(true);

    // Attempting to buy again returns 409
    const secondBuy = await app.request(
      `/api/v1/shop/items/${item.id}/buy`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(secondBuy.status).toBe(409);
  });

  it('rejects purchase when buyer has insufficient funds', async () => {
    const expensiveItem = await createShopItem(env.DB, {
      id: 'back_legendary_dragon_wings',
      creatorId,
      slot: 'back',
      name: 'Dragon Wings',
      description: 'Ultra rare',
      price: 999,
      status: 'approved'
    });

    const buyRes = await app.request(
      `/api/v1/shop/items/${expensiveItem.id}/buy`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` }
      },
      env
    );
    expect(buyRes.status).toBe(402);
    const err = (await buyRes.json()) as { error: string };
    expect(err.error).toContain('Insufficient');
  });

  it('enforces ownership check on avatar equip endpoint', async () => {
    const paidHat = await createShopItem(env.DB, {
      id: 'hat_golden_top_hat',
      creatorId,
      slot: 'hat',
      name: 'Golden Top Hat',
      description: 'Exclusive luxury hat',
      price: 150,
      status: 'approved'
    });

    // Unowned paid hat should be rejected
    const unownedRes = await app.request(
      '/api/v1/avatars/me',
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${buyerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hatId: paidHat.id })
      },
      env
    );
    expect(unownedRes.status).toBe(403);

    // Free items or legacy catalog items are allowed
    const legacyRes = await app.request(
      '/api/v1/avatars/me',
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${buyerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hatId: 'hat_cap_classic' })
      },
      env
    );
    expect(legacyRes.status).toBe(200);
  });
});
