// Studio Subdomain App Architecture & Multi-Tenant Routing Test Suite
// Verifies studio-game.lenout.com detection, root Hub routing, and cross-subdomain auth

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isStudioSubdomain,
  isStudioPathname,
  parseStudioRoute,
  resolveStudioExternalUrl,
  resolveWebPortalUrl
} from '../src/routes/studioRouting';
import {
  saveStoredToken,
  clearStoredToken,
  getStoredToken,
  TOKEN_STORAGE_KEY
} from '../src/api/auth';

class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length(): number { return Object.keys(this.store).length; }
  getItem(k: string): string | null { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k: string, v: string): void { this.store[k] = String(v); }
  removeItem(k: string): void { delete this.store[k]; }
  clear(): void { this.store = {}; }
  key(i: number): string | null { return Object.keys(this.store)[i] || null; }
}

describe('Studio Subdomain: Architecture & Host Detection', () => {
  it('correctly identifies studio subdomains vs main portal hosts', () => {
    expect(isStudioSubdomain('studio-game.lenout.com')).toBe(true);
    expect(isStudioSubdomain('studio.lenout.com')).toBe(true);
    expect(isStudioSubdomain('studio-preview.lenout.com')).toBe(true);
    expect(isStudioSubdomain('studio.localhost')).toBe(true);

    expect(isStudioSubdomain('game.lenout.com')).toBe(false);
    expect(isStudioSubdomain('api-game.lenout.com')).toBe(false);
    expect(isStudioSubdomain('assets-game.lenout.com')).toBe(false);
    expect(isStudioSubdomain('lenout.com')).toBe(false);
    expect(isStudioSubdomain('localhost')).toBe(false);
  });

  it('treats root path as studio on studio subdomain without requiring /studio prefix', () => {
    const hubRoute = parseStudioRoute('/', '', 'studio-game.lenout.com');
    expect(hubRoute.isStudio).toBe(true);
    expect(hubRoute.mapId).toBeNull();

    const normalRoot = parseStudioRoute('/', '', 'game.lenout.com');
    expect(normalRoot.isStudio).toBe(false);
    expect(normalRoot.mapId).toBeNull();
  });

  it('parses direct UUID path on studio subdomain without /studio prefix', () => {
    const targetUuid = 'c686b8f3-31a5-44cd-b06c-5fc89e53f9d0';
    const directRoute = parseStudioRoute(`/${targetUuid}`, '', 'studio-game.lenout.com');
    expect(directRoute.isStudio).toBe(true);
    expect(directRoute.mapId).toBe(targetUuid);

    const prefixedRoute = parseStudioRoute(`/studio/${targetUuid}`, '', 'studio-game.lenout.com');
    expect(prefixedRoute.isStudio).toBe(true);
    expect(prefixedRoute.mapId).toBe(targetUuid);
  });

  it('isStudioPathname returns true for any path when on studio subdomain', () => {
    expect(isStudioPathname('/', 'studio-game.lenout.com')).toBe(true);
    expect(isStudioPathname('/c686b8f3-31a5-44cd-b06c-5fc89e53f9d0', 'studio-game.lenout.com')).toBe(true);
    expect(isStudioPathname('/', 'game.lenout.com')).toBe(false);
  });
});

describe('Studio Subdomain: Cross-Site Link Resolution', () => {
  let mockWindow: { location: { hostname: string; protocol: string } };

  beforeEach(() => {
    mockWindow = {
      location: { hostname: 'game.lenout.com', protocol: 'https:' }
    };
    (globalThis as unknown as { window?: unknown }).window = mockWindow;
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('resolves external studio subdomain URLs when on lenout.com', () => {
    expect(resolveStudioExternalUrl()).toBe('https://studio.lenout.com');
    expect(resolveStudioExternalUrl(null)).toBe('https://studio.lenout.com');
    expect(resolveStudioExternalUrl('c686b8f3-31a5-44cd-b06c-5fc89e53f9d0')).toBe(
      'https://studio.lenout.com/c686b8f3-31a5-44cd-b06c-5fc89e53f9d0'
    );
  });

  it('resolves main web portal URL from studio subdomain', () => {
    mockWindow.location.hostname = 'studio-game.lenout.com';
    expect(resolveWebPortalUrl()).toBe('https://game.lenout.com');
  });
});

describe('Studio Subdomain: Cross-Subdomain Auth Handoff & Cookie Sync', () => {
  let mockStorage: MockStorage;
  let mockDoc: { cookie: string };

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockDoc = { cookie: '' };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = mockStorage;
    (globalThis as unknown as { document?: unknown }).document = mockDoc;
    (globalThis as unknown as { window?: unknown }).window = {
      location: { hostname: 'studio-game.lenout.com', protocol: 'https:', search: '', pathname: '/', hash: '' }
    };
    clearStoredToken();
  });

  afterEach(() => {
    clearStoredToken();
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { document?: unknown }).document;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('reads from cookie when localStorage is empty', () => {
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';
    mockDoc.cookie = `mochi_auth_token=${testToken}`;

    expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    const retrieved = getStoredToken();
    expect(retrieved).toBe(testToken);
    expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBe(testToken);
  });

  it('clears token cleanly from in-memory, localStorage, and cookie', () => {
    saveStoredToken('test-token-to-clear');
    clearStoredToken();
    expect(getStoredToken()).toBeNull();
    expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});
