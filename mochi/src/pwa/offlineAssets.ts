// IndexedDB L2 cache for individual offline assets. This is a separate tier
// from engine/assets/assetCache.ts (in-memory + OPFS); consumers can consult it
// as a fallback without changing the existing cache path.

import {
  OFFLINE_ASSETS_STORE,
  isIndexedDbAvailable,
  runOfflineStore
} from './offlineStore';

export interface OfflineAssetRecord {
  url: string;
  blob: Blob;
  savedAt: number;
}

export async function readOfflineAsset(url: string): Promise<Blob | null> {
  if (!isIndexedDbAvailable()) return null;
  try {
    return await runOfflineStore<Blob | null>(
      OFFLINE_ASSETS_STORE,
      'readonly',
      null,
      (value) => {
        const record = typeof value === 'object' && value !== null
          ? (value as OfflineAssetRecord)
          : null;
        return record && typeof Blob !== 'undefined' && record.blob instanceof Blob
          ? record.blob
          : null;
      },
      (store) => store.get(url)
    );
  } catch {
    return null;
  }
}

export async function writeOfflineAsset(url: string, blob: Blob): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    const record: OfflineAssetRecord = { url, blob, savedAt: Date.now() };
    await runOfflineStore<boolean>(
      OFFLINE_ASSETS_STORE,
      'readwrite',
      false,
      () => true,
      (store) => store.put(record, url),
      true
    );
  } catch {
    // Asset caching is best-effort; never throw.
  }
}
