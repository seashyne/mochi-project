// Platform gap tests: WebGPU capability detection and IndexedDB offline store.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectRendererCapabilities
} from '../src/engine/rendererCapabilities';
import { RuntimeEngine } from '../src/engine/runtimeEngine';
import {
  isIndexedDbAvailable,
  putOfflineGame,
  getOfflineGame,
  listOfflineGames,
  deleteOfflineGame
} from '../src/pwa/offlineStore';
import { readOfflineAsset, writeOfflineAsset } from '../src/pwa/offlineAssets';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWebgl2(available: boolean): void {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: (kind: string) =>
        available && kind === 'webgl2' ? { drawingBufferWidth: 800 } : null
    })
  });
}

function gpuNavigator(adapter: unknown): Record<string, unknown> {
  return { gpu: { requestAdapter: async () => adapter } };
}

describe('renderer capability detection', () => {
  it('prefers WebGPU and reports adapter info when an adapter resolves', async () => {
    stubWebgl2(true);
    const caps = await detectRendererCapabilities(
      gpuNavigator({ info: { vendor: 'acme', architecture: 'gen12', device: 'gpu0' } })
    );
    expect(caps.webgl2).toBe(true);
    expect(caps.webgpu).toBe(true);
    expect(caps.preferred).toBe('webgpu');
    expect(caps.adapterInfo).toContain('acme');
    expect(caps.adapterInfo).toContain('gen12');
  });

  it('falls back to WebGL2 when navigator.gpu is missing', async () => {
    stubWebgl2(true);
    const caps = await detectRendererCapabilities({});
    expect(caps.webgl2).toBe(true);
    expect(caps.webgpu).toBe(false);
    expect(caps.preferred).toBe('webgl2');
    expect(caps.adapterInfo).toBeNull();
  });

  it('treats a null adapter as no WebGPU', async () => {
    stubWebgl2(true);
    const caps = await detectRendererCapabilities(gpuNavigator(null));
    expect(caps.webgpu).toBe(false);
    expect(caps.preferred).toBe('webgl2');
    expect(caps.adapterInfo).toBeNull();
  });

  it('survives requestAdapter throwing', async () => {
    stubWebgl2(true);
    const caps = await detectRendererCapabilities({
      gpu: { requestAdapter: async () => { throw new Error('blocked'); } }
    });
    expect(caps.webgpu).toBe(false);
    expect(caps.preferred).toBe('webgl2');
  });

  it('ignores a gpu object without requestAdapter', async () => {
    stubWebgl2(true);
    const caps = await detectRendererCapabilities({ gpu: {} });
    expect(caps.webgpu).toBe(false);
    expect(caps.preferred).toBe('webgl2');
  });

  it('reports no renderer when WebGL2 context is absent', async () => {
    stubWebgl2(false);
    const caps = await detectRendererCapabilities({});
    expect(caps.webgl2).toBe(false);
    expect(caps.webgpu).toBe(false);
    expect(caps.preferred).toBe('none');
  });

  it('ignores getContext throwing for webgl2', async () => {
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => { throw new Error('no context'); } })
    });
    const caps = await detectRendererCapabilities({});
    expect(caps.webgl2).toBe(false);
    expect(caps.preferred).toBe('none');
  });

  it('never throws when no navigator or document is available', async () => {
    vi.stubGlobal('document', undefined);
    const explicit = await detectRendererCapabilities(null);
    expect(explicit).toEqual({
      webgl2: false, webgpu: false, preferred: 'none', adapterInfo: null
    });
    const globalProbe = await detectRendererCapabilities();
    expect(globalProbe.webgpu).toBe(false);
    expect(['webgpu', 'webgl2', 'none']).toContain(globalProbe.preferred);
  });
});

describe('RuntimeEngine capability wiring', () => {
  it('memoises detection and exposes it through a getter', async () => {
    vi.stubGlobal('document', undefined);
    const engine = new RuntimeEngine();
    expect(engine.getCapabilities()).toBeNull();
    const first = await engine.detectCapabilities();
    const second = await engine.detectCapabilities();
    expect(first.preferred).toBe('none');
    expect(second).toBe(first);
    expect(engine.getCapabilities()).toBe(first);
  });
});

// Minimal in-memory IndexedDB double: enough surface for the store's
// open/transaction/request flow, with no native dependency.
function createFakeIndexedDB() {
  const databases = new Map<string, any>();
  const makeRequest = () => ({
    onsuccess: null as null | (() => void),
    onerror: null as null | (() => void),
    onupgradeneeded: null as null | (() => void),
    onblocked: null as null | (() => void),
    result: undefined as unknown
  });

  return {
    open(name: string, version?: number) {
      const req = makeRequest();
      let db = databases.get(name);
      const fresh = !db;
      if (fresh) {
        db = {
          version: 0,
          stores: new Map<string, any>(),
          objectStoreNames: { contains: (n: string) => db.stores.has(n) },
          createObjectStore(n: string, options?: { keyPath?: string }) {
            const store = { keyPath: options?.keyPath, rows: new Map<unknown, unknown>() };
            db.stores.set(n, store);
            return store;
          },
          transaction(n: string) {
            const store = db.stores.get(n);
            const tx: any = { oncomplete: null, onabort: null, onerror: null };
            const run = (operation: () => unknown, commit: boolean) => {
              const r = makeRequest();
              queueMicrotask(() => {
                try {
                  r.result = operation();
                  r.onsuccess?.();
                  if (commit) tx.oncomplete?.();
                } catch (err) {
                  r.error = err;
                  r.onerror?.();
                  tx.onabort?.();
                }
              });
              return r;
            };
            tx.objectStore = () => ({
              put: (value: any, key?: unknown) => run(() => {
                const k = key ?? (store?.keyPath ? value[store.keyPath] : undefined);
                store.rows.set(k, value);
                return k;
              }, true),
              get: (key: unknown) => run(() => store.rows.get(key), false),
              getAll: () => run(() => [...store.rows.values()], false),
              delete: (key: unknown) => run(() => {
                store.rows.delete(key);
                return undefined;
              }, true)
            });
            return tx;
          },
          close() { /* no-op */ }
        };
        databases.set(name, db);
      }
      queueMicrotask(() => {
        req.result = db;
        if (fresh || (version !== undefined && version > db.version)) {
          db.version = version ?? 1;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    }
  };
}

describe('offlineStore graceful degradation', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
  });

  it('reports IndexedDB as unavailable', () => {
    expect(isIndexedDbAvailable()).toBe(false);
  });

  it('returns false/null/[] and never throws', async () => {
    expect(await putOfflineGame('g1', '1.0.0', '{}', {})).toBe(false);
    expect(await getOfflineGame('g1')).toBeNull();
    expect(await listOfflineGames()).toEqual([]);
    await expect(deleteOfflineGame('g1')).resolves.toBeUndefined();
  });

  it('offlineAssets also degrades to null/undefined', async () => {
    expect(await readOfflineAsset('https://cdn.test/a.glb')).toBeNull();
    await expect(writeOfflineAsset('u', new Blob(['x']))).resolves.toBeUndefined();
  });
});

describe('offlineStore round-trip with fake IndexedDB', () => {
  let fake: ReturnType<typeof createFakeIndexedDB>;

  beforeEach(() => {
    fake = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', fake);
  });

  it('saves, reads, lists and deletes a game bundle', async () => {
    expect(isIndexedDbAvailable()).toBe(true);
    const assets = { 'scene.bin': new ArrayBuffer(4), meta: 'v1' };
    expect(await putOfflineGame('game-1', '1.2.0', '{"a":1}', assets)).toBe(true);

    const record = await getOfflineGame('game-1');
    expect(record).not.toBeNull();
    expect(record!.gameId).toBe('game-1');
    expect(record!.version).toBe('1.2.0');
    expect(record!.manifest).toBe('{"a":1}');
    expect(record!.assets.meta).toBe('v1');
    expect(record!.assets['scene.bin']).toBeInstanceOf(ArrayBuffer);
    expect(typeof record!.savedAt).toBe('number');

    expect(await listOfflineGames()).toHaveLength(1);
    expect(await getOfflineGame('missing')).toBeNull();

    await deleteOfflineGame('game-1');
    expect(await getOfflineGame('game-1')).toBeNull();
    expect(await listOfflineGames()).toEqual([]);
  });

  it('caches individual blobs in the shared assets store', async () => {
    const blob = new Blob(['offline-bytes']);
    await writeOfflineAsset('https://cdn.test/a.glb', blob);
    const read = await readOfflineAsset('https://cdn.test/a.glb');
    expect(read).not.toBeNull();
    expect(await read!.text()).toBe('offline-bytes');
    expect(await readOfflineAsset('https://cdn.test/missing.glb')).toBeNull();
  });

  it('rejects a put when open() throws', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } });
    expect(await putOfflineGame('g2', '1', '{}', {})).toBe(false);
    expect(await getOfflineGame('g2')).toBeNull();
  });
});
