// Phase 3 web-side native bridge + IAP contract coverage.
// Runs in the default node environment: no DOM, no native plugins registered.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import {
  isNative,
  triggerHaptic,
  setOrientation,
  hideSplash,
  applySafeAreaInsets,
  getNativeCapabilities
} from '../src/native/nativeBridge';
import { createIapBridge, attachNativeIap } from '../src/native/iap';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('phase 3 native bridge on web', () => {
  it('isNative() is false on web', () => {
    expect(isNative()).toBe(false);
  });

  it('haptics falls back to navigator.vibrate and returns a boolean', async () => {
    const vibrate = vi.fn((_pattern: number | number[]) => true);
    vi.stubGlobal('navigator', { vibrate });

    const result = await triggerHaptic('medium');

    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0][0]).toBe(20);
  });

  it('propagates a false result from navigator.vibrate', async () => {
    const vibrate = vi.fn((_pattern: number | number[]) => false);
    vi.stubGlobal('navigator', { vibrate });

    expect(await triggerHaptic('light')).toBe(false);
  });

  it('returns false for haptics when the vibration API is absent', async () => {
    vi.stubGlobal('navigator', {});

    expect(await triggerHaptic('heavy')).toBe(false);
  });

  it('all methods resolve without throwing when no plugins exist', async () => {
    vi.stubGlobal('navigator', {});

    await expect(triggerHaptic('light')).resolves.toBe(false);
    await expect(setOrientation('landscape')).resolves.toBe(false);
    await expect(setOrientation('portrait')).resolves.toBe(false);
    await expect(setOrientation('any')).resolves.toBe(false);
    await expect(hideSplash()).resolves.toBe(false);
    expect(() => applySafeAreaInsets()).not.toThrow();
  });

  it('capability report is all false on web', () => {
    expect(getNativeCapabilities()).toEqual({
      haptics: false,
      orientation: false,
      splash: false,
      statusBar: false
    });
    expect(Object.keys(getNativeCapabilities()).sort()).toEqual([
      'haptics',
      'orientation',
      'splash',
      'statusBar'
    ]);
  });
});

describe('phase 3 native bridge with registered plugins', () => {
  it('drives real plugin methods when running natively', async () => {
    const impact = vi.fn(async (_options: { style: string }) => undefined);
    const lock = vi.fn(async (_options: { orientation: string }) => undefined);
    const unlock = vi.fn(async () => undefined);
    const hide = vi.fn(async () => undefined);
    const setOverlaysWebView = vi.fn(async (_options: { overlay: boolean }) => undefined);

    const registry = Capacitor.Plugins as unknown as Record<string, unknown>;
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    registry.Haptics = { impact };
    registry.ScreenOrientation = { lock, unlock };
    registry.SplashScreen = { hide };
    registry.StatusBar = { setOverlaysWebView };

    try {
      expect(isNative()).toBe(true);
      expect(await triggerHaptic('heavy')).toBe(true);
      expect(impact).toHaveBeenCalledWith({ style: 'HEAVY' });
      expect(await setOrientation('landscape')).toBe(true);
      expect(lock).toHaveBeenCalledWith({ orientation: 'landscape' });
      expect(await setOrientation('any')).toBe(true);
      expect(unlock).toHaveBeenCalledTimes(1);
      expect(await hideSplash()).toBe(true);
      expect(hide).toHaveBeenCalledTimes(1);
      expect(getNativeCapabilities()).toEqual({
        haptics: true,
        orientation: true,
        splash: true,
        statusBar: true
      });
    } finally {
      delete registry.Haptics;
      delete registry.ScreenOrientation;
      delete registry.SplashScreen;
      delete registry.StatusBar;
    }
  });

  it('returns false when a registered plugin throws', async () => {
    const registry = Capacitor.Plugins as unknown as Record<string, unknown>;
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    registry.SplashScreen = {
      hide: async () => {
        throw new Error('native bridge unavailable');
      }
    };

    try {
      expect(await hideSplash()).toBe(false);
    } finally {
      delete registry.SplashScreen;
    }
  });
});

describe('phase 3 IAP RPC contract on web', () => {
  it('web purchase returns the web-checkout-required reason', async () => {
    const bridge = createIapBridge();

    const result = await bridge.purchase('credits.small');

    expect(result).toEqual({ ok: false, reason: 'web-checkout-required' });
    expect(result.ok).toBe(false);
    expect(result.wallet).toBeUndefined();
    expect(result.ledgerEntry).toBeUndefined();
  });

  it('lists a local credit-pack catalog without calling an endpoint', async () => {
    const products = await createIapBridge().listProducts();

    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.creditsGranted).toBeGreaterThan(0);
      expect(product.priceCents).toBeGreaterThan(0);
      expect(product.nativeSku).toBeUndefined();
    }
  });

  it('restores no native receipts on web', async () => {
    expect(await createIapBridge().restore()).toEqual([]);
  });

  it('delegates to an injected native handler without faking success', async () => {
    const purchase = vi.fn(async (_productId: string) => ({
      ok: false,
      reason: 'cancelled' as const
    }));
    const bridge = attachNativeIap(createIapBridge(), { purchase });

    const result = await bridge.purchase('credits.medium');

    expect(purchase).toHaveBeenCalledWith('credits.medium');
    expect(result).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('reports failure rather than a fake success when native purchase throws', async () => {
    const bridge = attachNativeIap(createIapBridge(), {
      purchase: async () => {
        throw new Error('StoreKit unavailable');
      }
    });

    const result = await bridge.purchase('credits.large');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('failed');
    expect(result.productId).toBe('credits.large');
  });

  it('keeps the web fallback when the native handler lacks a method', async () => {
    const bridge = attachNativeIap(createIapBridge(), {});

    expect(await bridge.purchase('credits.small')).toEqual({
      ok: false,
      reason: 'web-checkout-required'
    });
    expect(await bridge.restore()).toEqual([]);
  });
});
