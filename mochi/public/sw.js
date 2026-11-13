// Mochi service worker: keeps the app shell, the hashed build output and the
// creator media cached so a repeat visit never downloads what it already has.
// API traffic is never cached.

const VERSION = 'mochi-pwa-__BUILD_ID__';
const SHELL_CACHE = `${VERSION}-shell`;
const IMMUTABLE_CACHE = `${VERSION}-immutable`;
const MEDIA_CACHE = `${VERSION}-media`;

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

// Vite fingerprints everything under /assets/, so a hit can never be stale.
const IMMUTABLE_PREFIXES = ['/assets/', '/draco/', '/basis/'];

// Creator media keeps stable paths, so it is served from cache and refreshed in
// the background instead of being trusted forever.
const MEDIA_PREFIXES = ['/models/', '/skyboxes/', '/materials/', '/wasm/', '/fonts/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request) {
  const cache = await caches.open(IMMUTABLE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void network;
    return cached;
  }

  const response = await network;
  if (response) return response;
  throw new Error('offline');
}

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  if (matchesPrefix(url.pathname, IMMUTABLE_PREFIXES)) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(request)));
    return;
  }

  if (matchesPrefix(url.pathname, MEDIA_PREFIXES)) {
    event.respondWith(staleWhileRevalidate(request).catch(() => caches.match(request)));
  }
});
