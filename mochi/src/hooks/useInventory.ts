// Shared inventory loader for the inventory and trade pages

import { useCallback, useEffect, useState } from 'react';
import { InventoryItem } from '../api/shopTypes';
import { shopApi } from '../api/shop';
import { useAuthStore } from '../store/useAuthStore';

export interface InventoryState {
  items: InventoryItem[];
  isLoading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
}

export function useInventory(): InventoryState {
  const token = useAuthStore((state) => state.token);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    setFailed(false);
    try {
      const inventory = await shopApi.getInventory(token);
      setItems(inventory);
    } catch {
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, isLoading, failed, refresh };
}
