// Phase 3 native container bridge (web side).
//
// Native plugins are reached exclusively through the Capacitor.Plugins
// registry. Nothing in this module statically imports @capacitor/haptics,
// @capacitor/screen-orientation, @capacitor/splash-screen,
// @capacitor/status-bar or @capacitor/keyboard, so it type-checks and runs
// before those packages are installed or the native projects are scaffolded.
// Plugins register themselves on Capacitor.Plugins at runtime, so resolving
// the registry on every call also picks up late registrations.

import { Capacitor } from '@capacitor/core';

export interface NativeCapabilities {
  haptics: boolean;
  orientation: boolean;
  splash: boolean;
  statusBar: boolean;
}

export type HapticKind = 'light' | 'medium' | 'heavy';
export type OrientationMode = 'landscape' | 'portrait' | 'any';

type HapticStyle = 'LIGHT' | 'MEDIUM' | 'HEAVY';

interface HapticsPlugin {
  impact(options: { style: HapticStyle }): Promise<void>;
}

interface ScreenOrientationPlugin {
  lock(options: { orientation: string }): Promise<void>;
  unlock(): Promise<void>;
}

interface SplashScreenPlugin {
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
}

interface StatusBarPlugin {
  setOverlaysWebView(options: { overlay: boolean }): Promise<void>;
}

interface KeyboardPlugin {
  setResizeMode(options: { mode: string }): Promise<void>;
}

// Minimal local view of the registry. Cast through `unknown` because the
// shipped PluginRegistry type is a loose { [prop: string]: any } map.
interface NativePluginRegistry {
  Haptics?: HapticsPlugin;
  ScreenOrientation?: ScreenOrientationPlugin;
  SplashScreen?: SplashScreenPlugin;
  StatusBar?: StatusBarPlugin;
  Keyboard?: KeyboardPlugin;
}

const HAPTIC_STYLES: Record<HapticKind, HapticStyle> = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY'
};

const VIBRATION_MS: Record<HapticKind, number> = {
  light: 10,
  medium: 20,
  heavy: 40
};

const NO_CAPABILITIES: NativeCapabilities = {
  haptics: false,
  orientation: false,
  splash: false,
  statusBar: false
};

const SAFE_AREA_SIDES = ['top', 'right', 'bottom', 'left'] as const;

interface VibrationNavigator {
  vibrate?: (pattern: number | number[]) => boolean;
}

function plugins(): NativePluginRegistry {
  try {
    const registry = Capacitor.Plugins as unknown as NativePluginRegistry;
    return registry && typeof registry === 'object' ? registry : {};
  } catch {
    return {};
  }
}

/** True only inside an iOS/Android Capacitor webview. Never throws. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function vibrate(kind: HapticKind): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & VibrationNavigator;
    if (typeof nav.vibrate !== 'function') return false;
    return Boolean(nav.vibrate(VIBRATION_MS[kind]));
  } catch {
    return false;
  }
}

/**
 * Fires a native impact on a real device. On web (or when the plugin is
 * missing) it degrades to navigator.vibrate and reports whether anything
 * was actually delivered.
 */
export async function triggerHaptic(kind: HapticKind = 'medium'): Promise<boolean> {
  const resolved: HapticKind = kind in HAPTIC_STYLES ? kind : 'medium';

  if (isNative()) {
    const haptics = plugins().Haptics;
    if (haptics && typeof haptics.impact === 'function') {
      try {
        await haptics.impact({ style: HAPTIC_STYLES[resolved] });
        return true;
      } catch {
        // Fall through to the web vibration fallback.
      }
    }
  }

  return vibrate(resolved);
}

/** Locks or unlocks screen orientation. No-op (false) on web. */
export async function setOrientation(mode: OrientationMode): Promise<boolean> {
  if (!isNative()) return false;

  const orientation = plugins().ScreenOrientation;
  if (!orientation) return false;

  try {
    if (mode === 'any') {
      if (typeof orientation.unlock !== 'function') return false;
      await orientation.unlock();
      return true;
    }
    if (typeof orientation.lock !== 'function') return false;
    await orientation.lock({ orientation: mode });
    return true;
  } catch {
    return false;
  }
}

/** Hides the native splash screen after first paint. No-op (false) on web. */
export async function hideSplash(): Promise<boolean> {
  if (!isNative()) return false;

  const splash = plugins().SplashScreen;
  if (!splash || typeof splash.hide !== 'function') return false;

  try {
    await splash.hide();
    return true;
  } catch {
    return false;
  }
}

function parsePx(raw: string): number {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function applyNativeChrome(): void {
  try {
    const registry = plugins();
    if (registry.Keyboard && typeof registry.Keyboard.setResizeMode === 'function') {
      Promise.resolve(registry.Keyboard.setResizeMode({ mode: 'body' })).catch(() => undefined);
    }
    if (registry.StatusBar && typeof registry.StatusBar.setOverlaysWebView === 'function') {
      Promise.resolve(registry.StatusBar.setOverlaysWebView({ overlay: true })).catch(() => undefined);
    }
  } catch {
    // Chrome tweaks are best-effort and must not break first paint.
  }
}

/**
 * Publishes native safe-area insets as CSS custom properties
 * (--mochi-safe-area-top/right/bottom/left) on <html>. A hidden probe element
 * reads env(safe-area-inset-*) through computed style, which is the only way
 * to turn those CSS values into numbers JavaScript can reuse. On web there
 * are no container insets to bridge, so this is an intentional no-op.
 */
export function applySafeAreaInsets(): void {
  if (!isNative()) return;

  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (typeof window.getComputedStyle !== 'function') return;

    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;

    let probe: HTMLElement | null = document.getElementById('mochi-safe-area-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'mochi-safe-area-probe';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;';
      body.appendChild(probe);
    }

    probe.style.padding =
      'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) ' +
      'env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';

    const computed = window.getComputedStyle(probe);
    const values: Record<(typeof SAFE_AREA_SIDES)[number], string> = {
      top: computed.paddingTop,
      right: computed.paddingRight,
      bottom: computed.paddingBottom,
      left: computed.paddingLeft
    };

    for (const side of SAFE_AREA_SIDES) {
      root.style.setProperty(`--mochi-safe-area-${side}`, `${parsePx(values[side])}px`);
    }
    root.classList.add('mochi-safe-areas');
  } catch {
    // Inset probing is best-effort; never throw from a capability helper.
  }

  applyNativeChrome();
}

/** Reports which native plugin implementations are actually reachable. */
export function getNativeCapabilities(): NativeCapabilities {
  if (!isNative()) return { ...NO_CAPABILITIES };

  const registry = plugins();
  return {
    haptics: typeof registry.Haptics?.impact === 'function',
    orientation:
      typeof registry.ScreenOrientation?.lock === 'function' &&
      typeof registry.ScreenOrientation?.unlock === 'function',
    splash: typeof registry.SplashScreen?.hide === 'function',
    statusBar: typeof registry.StatusBar?.setOverlaysWebView === 'function'
  };
}
