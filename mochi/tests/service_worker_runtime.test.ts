// Functional tests for the real service worker source. The worker is executed
// in a VM with mocked Service Worker globals, so we verify behaviour (cache
// hits, background revalidation, eviction, offline fallback) rather than just
// asserting that certain strings appear in the file.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { registerServiceWorker } from '../src/pwa/registerServiceWorker';

const ROOT = path.resolve(__dirname, '..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://game.lenout.com';

interface FakeResponse {
  ok: boolean;
  body: string;
  clone: () => FakeResponse;
}

function response(body = 'payload'): FakeResponse {
  return { ok: true, body, clone: () => response(body) };
}

function keyOf(request: string | { url: string }): string {
  return typeof request === 'string' ? request : request.url;
}

class FakeCache {
  public readonly entries = new Map<string, FakeResponse>();

  async match(request: string | { url: string }): Promise<FakeResponse | undefined> {
    return this.entries.get(keyOf(request));
  }

  async put(request: string | { url: string }, value: FakeResponse): Promise<void> {
    this.entries.set(keyOf(request), value);
  }

  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) this.entries.set(url, response());
  }
}

type FetchFn = (request: { url: string }) => Promise<FakeResponse>;

function createHarness() {
  const cachesMap = new Map<string, FakeCache>();
  const listeners = new Map<string, (event: unknown) => void>();
  const fetchCalls: string[] = [];
  let fetchImpl: FetchFn = async (request) => {
    fetchCalls.push(request.url);
    return response();
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, cb: (event: unknown) => void) => listeners.set(type, cb),
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() }
  };

  const caches = {
    open: async (name: string) => {
      if (!cachesMap.has(name)) cachesMap.set(name, new FakeCache());
      return cachesMap.get(name)!;
    },
    match: async (request: string | { url: string }) => {
      for (const cache of cachesMap.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...cachesMap.keys()],
    delete: async (name: string) => cachesMap.delete(name)
  };

  const context = vm.createContext({
    self,
    caches,
    URL,
    Promise,
    Error,
    Map,
    Set,
    Array,
    Object,
    String,
    console,
    fetch: (request: { url: string }) => fetchImpl(request)
  });
  vm.runInContext(SW_SOURCE, context);

  const requestFor = (pathname: string, overrides: Record<string, unknown> = {}) => ({
    url: `${ORIGIN}${pathname}`,
    method: 'GET',
    mode: 'navigate',
    ...overrides
  });

  async function fireLifecycle(type: 'install' | 'activate'): Promise<void> {
    let pending: Promise<unknown> | undefined;
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
  }

  function fireFetch(request: ReturnType<typeof requestFor>): {
    handled: boolean;
    result: () => Promise<unknown>;
  } {
    let responded: Promise<unknown> | undefined;
    listeners.get('fetch')?.({
      request,
      respondWith: (p: Promise<unknown>) => { responded = p; }
    });
    return { handled: responded !== undefined, result: async () => responded };
  }

  return {
    cachesMap,
    fetchCalls,
    setFetch: (fn: FetchFn) => { fetchImpl = fn; },
    requestFor,
    fireLifecycle,
    fireFetch
  };
}

describe('Service worker: shell lifecycle', () => {
  it('precaches the app shell on install', async () => {
    const sw = createHarness();
    await sw.fireLifecycle('install');

    const shell = [...sw.cachesMap.entries()].find(([name]) => name.includes('shell'));
    expect(shell).toBeDefined();
    expect([...shell![1].entries.keys()]).toEqual(
      expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'])
    );
  });

  it('evicts caches belonging to an older build on activate', async () => {
    const sw = createHarness();
    sw.cachesMap.set('mochi-pwa-OLD-shell', new FakeCache());
    await sw.fireLifecycle('install');
    await sw.fireLifecycle('activate');

    expect([...sw.cachesMap.keys()].some((name) => name.includes('OLD'))).toBe(false);
    expect([...sw.cachesMap.keys()].every((name) => name.includes('__BUILD_ID__'))).toBe(true);
  });

  it('never intercepts API traffic or non-GET requests', () => {
    const sw = createHarness();
    expect(sw.fireFetch(sw.requestFor('/api/v1/games', { mode: 'cors' })).handled).toBe(false);
    expect(sw.fireFetch(sw.requestFor('/assets/a.js', { method: 'POST', mode: 'cors' })).handled).toBe(false);
    expect(sw.fetchCalls).toHaveLength(0);
  });

  it('ignores cross-origin requests', () => {
    const sw = createHarness();
    const external = { url: 'https://cdn.example.com/assets/a.js', method: 'GET', mode: 'cors' };
    expect(sw.fireFetch(external).handled).toBe(false);
  });
});

describe('Service worker: hashed assets are never re-downloaded', () => {
  it('serves the second request for a chunk straight from cache', async () => {
    const sw = createHarness();
    const request = sw.requestFor('/assets/index-abc123.js', { mode: 'cors' });

    const first = await sw.fireFetch(request).result();
    expect(first).toBeDefined();
    expect(sw.fetchCalls).toEqual([request.url]);

    const second = await sw.fireFetch(request).result();
    expect((second as FakeResponse).body).toBe('payload');
    expect(sw.fetchCalls).toHaveLength(1);
  });

  it('falls back to the cached copy when the network fails', async () => {
    const sw = createHarness();
    const request = sw.requestFor('/assets/index-abc123.js', { mode: 'cors' });
    await sw.fireFetch(request).result();

    sw.setFetch(async () => { throw new Error('offline'); });
    const offline = await sw.fireFetch(request).result();
    expect((offline as FakeResponse).body).toBe('payload');
  });
});

describe('Service worker: creator media revalidates', () => {
  it('returns the cached skybox immediately and refreshes it in the background', async () => {
    const sw = createHarness();
    const request = sw.requestFor('/skyboxes/sunset/env.exr', { mode: 'cors' });

    await sw.fireFetch(request).result();
    expect(sw.fetchCalls).toEqual([request.url]);

    const cached = await sw.fireFetch(request).result();
    expect((cached as FakeResponse).body).toBe('payload');

    await Promise.resolve();
    await Promise.resolve();
    expect(sw.fetchCalls).toHaveLength(2);
  });

  it('waits for the network on a first, uncached media request', async () => {
    const sw = createHarness();
    const request = sw.requestFor('/materials/brick/albedo.jpg', { mode: 'cors' });

    const result = await sw.fireFetch(request).result();
    expect((result as FakeResponse).body).toBe('payload');
    expect(sw.fetchCalls).toEqual([request.url]);
  });

  it('does not cache a failed media response', async () => {
    const sw = createHarness();
    sw.setFetch(async (request) => {
      sw.fetchCalls.push(request.url);
      return { ok: false, body: '', clone: () => ({ ok: false, body: '', clone: () => response() }) };
    });
    const request = sw.requestFor('/wasm/kernel.wasm', { mode: 'cors' });
    await sw.fireFetch(request).result();

    const media = [...sw.cachesMap.entries()].find(([name]) => name.includes('media'));
    expect([...media![1].entries.keys()]).not.toContain(request.url);
  });
});

describe('Service worker: offline navigation', () => {
  it('serves the cached shell when navigation fails', async () => {
    const sw = createHarness();
    await sw.fireLifecycle('install');

    sw.setFetch(async () => { throw new Error('offline'); });
    const request = sw.requestFor('/play/abc123');
    const result = await sw.fireFetch(request).result();

    expect((result as FakeResponse).body).toBe('payload');
  });
});

describe('Service worker: registration path', () => {
  it('registers /sw.js on window load when production support is available', () => {
    const loadHandlers: Array<() => void> = [];
    const register = vi.fn().mockResolvedValue({});

    vi.stubGlobal('window', {
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'load') loadHandlers.push(cb);
      }
    });
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    try {
      registerServiceWorker({ isProduction: true, hasServiceWorker: true });
      expect(loadHandlers).toHaveLength(1);

      loadHandlers[0]();
      expect(register).toHaveBeenCalledWith('/sw.js');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not touch window when registration is not applicable', () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener });

    try {
      registerServiceWorker({ isProduction: false, hasServiceWorker: true });
      registerServiceWorker({ isProduction: true, hasServiceWorker: false });
      expect(addEventListener).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
