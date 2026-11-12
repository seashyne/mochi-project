// IndexedDB-backed L2 store for offline game bundles. One database
// ("mochi-offline") holds the "games" object store (this module) and the
// "assets" object store (offlineAssets). Every public method resolves to a
// safe fallback and never rejects when IndexedDB is unavailable (SSR, jsdom,
// blocked storage).

export const OFFLINE_DB_NAME = 'mochi-offline';
export const OFFLINE_GAMES_STORE = 'games';
export const OFFLINE_ASSETS_STORE = 'assets';
const DB_VERSION = 1;

export interface OfflineGameRecord {
  gameId: string;
  version: string;
  manifest: string;
  assets: Record<string, ArrayBuffer | string>;
  savedAt: number;
}

export function isIndexedDbAvailable(): boolean {
  try {
    return (
      typeof indexedDB !== 'undefined' &&
      indexedDB !== null &&
      typeof indexedDB.open === 'function'
    );
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!isIndexedDbAvailable()) {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(OFFLINE_DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      try {
        if (!db.objectStoreNames.contains(OFFLINE_GAMES_STORE)) {
          db.createObjectStore(OFFLINE_GAMES_STORE, { keyPath: 'gameId' });
        }
        if (!db.objectStoreNames.contains(OFFLINE_ASSETS_STORE)) {
          db.createObjectStore(OFFLINE_ASSETS_STORE);
        }
      } catch {
        // Another connection may have created the stores already.
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export function settleStoreRequest<T>(
  request: IDBRequest,
  transaction: IDBTransaction,
  fallback: T,
  map: (value: unknown) => T,
  waitForCommit = false
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const success = (): void => {
      try {
        finish(map(request.result));
      } catch {
        finish(fallback);
      }
    };
    request.onsuccess = waitForCommit ? null : success;
    request.onerror = () => finish(fallback);
    transaction.oncomplete = waitForCommit ? success : null;
    transaction.onabort = () => finish(fallback);
    transaction.onerror = () => finish(fallback);
  });
}

export async function runOfflineStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fallback: T,
  map: (value: unknown) => T,
  run: (store: IDBObjectStore) => IDBRequest,
  waitForCommit = false
): Promise<T> {
  const db = await openDatabase();
  if (!db) return fallback;
  try {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    return await settleStoreRequest(request, transaction, fallback, map, waitForCommit);
  } catch {
    return fallback;
  } finally {
    try {
      db.close();
    } catch {
      // Closing an already-closed connection is harmless.
    }
  }
}

function toGameRecord(value: unknown): OfflineGameRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as OfflineGameRecord)
    : null;
}

export async function putOfflineGame(
  gameId: string,
  version: string,
  manifest: string,
  assets: Record<string, ArrayBuffer | string>
): Promise<boolean> {
  try {
    const record: OfflineGameRecord = {
      gameId,
      version,
      manifest,
      assets,
      savedAt: Date.now()
    };
    return await runOfflineStore<boolean>(
      OFFLINE_GAMES_STORE,
      'readwrite',
      false,
      () => true,
      (store) => store.put(record),
      true
    );
  } catch {
    return false;
  }
}

export async function getOfflineGame(gameId: string): Promise<OfflineGameRecord | null> {
  try {
    return await runOfflineStore<OfflineGameRecord | null>(
      OFFLINE_GAMES_STORE,
      'readonly',
      null,
      toGameRecord,
      (store) => store.get(gameId)
    );
  } catch {
    return null;
  }
}

export async function listOfflineGames(): Promise<OfflineGameRecord[]> {
  try {
    return await runOfflineStore<OfflineGameRecord[]>(
      OFFLINE_GAMES_STORE,
      'readonly',
      [],
      (value) => (Array.isArray(value) ? (value as OfflineGameRecord[]) : []),
      (store) => store.getAll()
    );
  } catch {
    return [];
  }
}

export async function deleteOfflineGame(gameId: string): Promise<void> {
  try {
    await runOfflineStore<boolean>(
      OFFLINE_GAMES_STORE,
      'readwrite',
      false,
      () => true,
      (store) => store.delete(gameId),
      true
    );
  } catch {
    // Deletion is best-effort; never throw.
  }
}
