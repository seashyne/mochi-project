// PWA installability and offline caching contract tests.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shouldRegisterServiceWorker } from '../src/pwa/registerServiceWorker';

const ROOT = path.resolve(__dirname, '..');

function readPublic(file: string): string {
  return fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
}

describe('PWA manifest and install metadata', () => {
  const manifest = JSON.parse(readPublic('manifest.webmanifest'));

  it('declares a standalone, installable app shell', () => {
    expect(manifest.name).toContain('Mochi');
    expect(manifest.short_name).toBe('Mochi');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#090b10');
    expect(manifest.background_color).toBe('#090b10');
  });

  it('ships at least one maskable icon served from the origin', () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    const icon = manifest.icons[0];
    expect(icon.src.startsWith('/')).toBe(true);
    expect(icon.type).toBe('image/svg+xml');
    expect(icon.purpose).toContain('maskable');
  });

  it('links the manifest and theme color from index.html', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color" content="#090b10"');
    expect(html).toContain('apple-mobile-web-app-capable');
  });
});

describe('service worker caching strategy', () => {
  const sw = readPublic('sw.js');

  it('precaches the shell and versions its caches', () => {
    expect(sw).toContain("const VERSION = 'mochi-pwa-__BUILD_ID__'");
    expect(sw).toContain("'/index.html'");
    expect(sw).toContain("'/manifest.webmanifest'");
    expect(sw).toContain('self.skipWaiting()');
    expect(sw).toContain('self.clients.claim()');
  });

  it('uses cache-first for immutable game assets', () => {
    expect(sw).toContain("'/assets/'");
    expect(sw).toContain("'/draco/'");
    expect(sw).toContain("'/basis/'");
    expect(sw).toContain('cache.put(request, response.clone())');
  });

  it('revalidates creator media in the background instead of trusting it forever', () => {
    expect(sw).toContain("'/models/'");
    expect(sw).toContain("'/skyboxes/'");
    expect(sw).toContain("'/materials/'");
    expect(sw).toContain("'/wasm/'");
    expect(sw).toContain('staleWhileRevalidate');
  });

  it('keeps every cache generation separate so old builds are evicted', () => {
    expect(sw).toContain('IMMUTABLE_CACHE');
    expect(sw).toContain('MEDIA_CACHE');
    expect(sw).toContain('!key.startsWith(VERSION)');
  });

  it('never caches API traffic and only intercepts GET requests', () => {
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('cacheFirst(request)');
  });

  it('falls back to the cached shell when navigation fails offline', () => {
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain("caches.match('/index.html')");
  });
});

describe('HTTP cache headers', () => {
  const headers = readPublic('_headers');

  it('marks fingerprinted build output as immutable', () => {
    expect(headers).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  it('revalidates creator media with stale-while-revalidate', () => {
    for (const prefix of ['/skyboxes/*', '/materials/*', '/models/*', '/wasm/*']) {
      expect(headers).toContain(prefix);
    }
    expect(headers).toContain('stale-while-revalidate=604800');
  });

  it('never lets the shell document or the service worker go stale', () => {
    expect(headers).toMatch(/\/index\.html\n\s+Cache-Control: public, max-age=0, must-revalidate/);
    expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });
});

describe('service worker covers both apps', () => {
  it('registers the worker from the player entry', () => {
    const entry = fs.readFileSync(path.join(ROOT, 'src/apps/player/main.tsx'), 'utf8');
    expect(entry).toContain('registerServiceWorker()');
  });

  it('registers the worker from the studio entry so the editor chunk is cached', () => {
    const entry = fs.readFileSync(path.join(ROOT, 'apps/studio/main.tsx'), 'utf8');
    expect(entry).toContain('registerServiceWorker()');
  });

  it('ships the worker and the header rules in both build outputs', () => {
    const studioConfig = fs.readFileSync(path.join(ROOT, 'vite.studio.config.ts'), 'utf8');
    expect(studioConfig).toMatch(/publicDir: path\.resolve\([^,]+, 'public'\)/);
  });

  it('gives every deploy its own cache generation', () => {
    const stamp = fs.readFileSync(path.join(ROOT, 'vite.plugins.ts'), 'utf8');
    expect(stamp).toContain('__BUILD_ID__');
    expect(stamp).toContain('serviceWorkerStamp');

    for (const config of ['vite.player.config.ts', 'vite.studio.config.ts']) {
      const source = fs.readFileSync(path.join(ROOT, config), 'utf8');
      expect(source, `${config} does not stamp the service worker`).toContain('serviceWorkerStamp(');
    }
  });
});

describe('service worker registration guard', () => {
  it('registers only in production when the API exists', () => {
    expect(shouldRegisterServiceWorker({ isProduction: true, hasServiceWorker: true })).toBe(true);
  });

  it('skips registration outside production or without support', () => {
    expect(shouldRegisterServiceWorker({ isProduction: false, hasServiceWorker: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: true, hasServiceWorker: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: false, hasServiceWorker: false })).toBe(false);
  });
});
