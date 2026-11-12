// Persistent asset cache behavior with and without OPFS

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchAsset,
  fetchAssetJson,
  readCachedAsset,
  writeCachedAsset,
  MAX_MEMORY_CACHE_BYTES,
  clearAssetCache
} from '../src/engine/assets/assetCache';

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearAssetCache();
});

describe('asset cache', () => {
  it('downloads once and serves repeat reads from memory', async () => {
    const payload = { objects: [{ id: 'a' }] };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchAssetJson<typeof payload>('https://cdn.test/chunk-a.json');
    const second = await fetchAssetJson<typeof payload>('https://cdn.test/chunk-a.json');

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stores blobs for later reads', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const fetchMock = vi.fn(async () => new Response(blob, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://cdn.test/model-b.glb';
    const downloaded = await fetchAsset(url);
    expect(downloaded.size).toBe(3);

    const cached = await readCachedAsset(url);
    expect(cached).not.toBeNull();
    expect(await cached!.arrayBuffer()).toEqual(await downloaded.arrayBuffer());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses the whole-asset cache for Range and never caches partial bodies as whole files', async () => {
    const url = 'https://cdn.test/ranged.glb';
    await writeCachedAsset(url, new Blob(['complete']));
    const fetcher = vi.fn(async () => new Response('par', { status: 206 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await (await fetchAsset(url, { headers: { Range: 'bytes=0-2' } })).text()).toBe('par');
    expect(await (await fetchAsset(url)).text()).toBe('complete');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await fetchAsset('https://cdn.test/partial.glb');
    expect(await readCachedAsset('https://cdn.test/partial.glb')).toBeNull();
  });

  it('rejects oversized bodies even when the server omits Content-Length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('too large')));
    await expect(fetchAsset('https://cdn.test/oversized.json', undefined, 3)).rejects.toThrow('byte limit');
    expect(await readCachedAsset('https://cdn.test/oversized.json')).toBeNull();
  });

  it('honors cancellation on cached reads and avoids caching cancelled downloads', async () => {
    const url = 'https://cdn.test/cancel.json';
    await writeCachedAsset(url, new Blob(['cached']));
    const abort = new AbortController(); abort.abort();
    await expect(fetchAsset(url, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const pending = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => { pending.abort(); return new Response('late'); }));
    await expect(fetchAsset('https://cdn.test/late.json', { signal: pending.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readCachedAsset('https://cdn.test/late.json')).toBeNull();
  });

  it('evicts least-recently-read memory entries at the byte ceiling', async () => {
    const blob = new Blob([new Uint8Array(MAX_MEMORY_CACHE_BYTES / 2)]);
    await writeCachedAsset('https://cdn.test/first', blob);
    await writeCachedAsset('https://cdn.test/second', blob);
    await readCachedAsset('https://cdn.test/first');
    await writeCachedAsset('https://cdn.test/third', blob);
    expect(await readCachedAsset('https://cdn.test/first')).not.toBeNull();
    expect(await readCachedAsset('https://cdn.test/second')).toBeNull();
    expect(await readCachedAsset('https://cdn.test/third')).not.toBeNull();
  });

  it('surfaces HTTP failures instead of caching them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 }))
    );

    await expect(fetchAsset('https://cdn.test/missing-c.glb')).rejects.toThrow(
      /404/
    );
    expect(await readCachedAsset('https://cdn.test/missing-c.glb')).toBeNull();
  });

  it('waits for in-flight OPFS writes instead of reading uncommitted empty files', async () => {
    const committed = new Map<string, Blob>();
    const created = new Set<string>();
    let releaseClose!: () => void;
    const closeGate = new Promise<void>(resolve => { releaseClose = resolve; });
    let firstWrite = true;
    const directory = {
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        if (!created.has(name)) {
          if (!options?.create) throw new Error('NotFoundError');
          created.add(name);
        }
        const gated = firstWrite;
        firstWrite = false;
        return {
          getFile: async () => committed.get(name) ?? new Blob([]),
          createWritable: async () => {
            let staged: Blob = new Blob([]);
            return {
              write: async (blob: Blob) => { staged = blob; },
              close: async () => { if (gated) await closeGate; committed.set(name, staged); }
            };
          }
        };
      },
      entries: async function* () { for (const name of created) yield [name, {}] as const; },
      removeEntry: async (name: string) => { created.delete(name); committed.delete(name); }
    };
    vi.stubGlobal('navigator', {
      storage: { getDirectory: async () => ({ getDirectoryHandle: async () => directory }) }
    });
    vi.resetModules();
    const cache = await import('../src/engine/assets/assetCache');
    const url = 'https://cdn.test/inflight.json';
    const bytes = new Uint8Array([7, 8, 9]);
    const writing = cache.writeCachedAsset(url, new Blob([bytes]));
    const half = new Blob([new Uint8Array(cache.MAX_MEMORY_CACHE_BYTES / 2)]);
    await cache.writeCachedAsset('https://cdn.test/filler-a', half);
    await cache.writeCachedAsset('https://cdn.test/filler-b', half);
    let settled = false;
    const reading = cache.readCachedAsset(url).then(blob => { settled = true; return blob; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    releaseClose();
    await writing;
    const blob = await reading;
    expect(blob).not.toBeNull();
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes);
    await cache.clearAssetCache();
  });
});
