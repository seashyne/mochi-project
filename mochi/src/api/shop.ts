// Shop, Wallet, and Inventory API client module for Mochi Platform

import { ApiClient, defaultApiClient } from './client';
import {
  ShopItem,
  Wallet,
  CoinLedgerEntry,
  InventoryItem,
  ListShopItemsParams
} from './shopTypes';

export class ShopApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  public async listItems(params: ListShopItemsParams = {}): Promise<ShopItem[]> {
    const searchParams = new URLSearchParams();
    if (params.slot) searchParams.set('slot', params.slot);
    if (params.q) searchParams.set('q', params.q);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/api/v1/shop/items${qs ? `?${qs}` : ''}`;
    const res = await this.client.get<{ success: boolean; items: ShopItem[] }>(endpoint);
    return res.items || [];
  }

  public async getItem(id: string): Promise<ShopItem> {
    const res = await this.client.get<{ success: boolean; item: ShopItem }>(
      `/api/v1/shop/items/${encodeURIComponent(id)}`
    );
    return res.item;
  }

  public async buyItem(
    id: string,
    token?: string
  ): Promise<{ inventoryItem: InventoryItem; balance: number }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.client.post<{
      success: boolean;
      inventoryItem: InventoryItem;
      balance: number;
    }>(`/api/v1/shop/items/${encodeURIComponent(id)}/buy`, {}, { headers });
    return { inventoryItem: res.inventoryItem, balance: res.balance };
  }

  public async getInventory(token?: string): Promise<InventoryItem[]> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.client.get<{ success: boolean; inventory: InventoryItem[] }>(
      '/api/v1/shop/inventory',
      { headers }
    );
    return res.inventory || [];
  }

  public async getWallet(token?: string): Promise<Wallet> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.client.get<{ success: boolean; wallet: Wallet }>(
      '/api/v1/shop/wallet',
      { headers }
    );
    return res.wallet;
  }

  public async getLedger(token?: string): Promise<CoinLedgerEntry[]> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.client.get<{ success: boolean; ledger: CoinLedgerEntry[] }>(
      '/api/v1/shop/wallet/ledger',
      { headers }
    );
    return res.ledger || [];
  }

  public async createItem(
    data: {
      slot: string;
      name: string;
      description?: string;
      price?: number;
      assetKey?: string;
      thumbKey?: string;
    },
    token?: string
  ): Promise<ShopItem> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.client.post<{ success: boolean; item: ShopItem }>(
      '/api/v1/shop/items',
      data,
      { headers }
    );
    return res.item;
  }
}

export const shopApi = new ShopApi();
