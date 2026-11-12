// Unit & Integration Tests for Mochi Studio Desktop Gating, Device Detection, and Lazy Separation

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  isDesktopDevice,
  isMobileDevice,
  isTabletDevice,
  getDeviceCategory,
  DeviceDetectionOptions,
} from '../src/utils/deviceDetector';
import { StudioDesktopGate } from '../src/components/studio/StudioDesktopGate';
import { StudioRouteLoading, StudioRoute } from '../src/components/studio/StudioRoute';

describe('Mochi Studio Device Detection & PC Gating Suite', () => {
  const DESKTOP_WINDOWS_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const DESKTOP_MAC_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const ANDROID_PHONE_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
  const IPAD_UA =
    'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

  it('identifies standard Windows and Mac desktop PCs as desktop devices', () => {
    const winPc: DeviceDetectionOptions = {
      userAgent: DESKTOP_WINDOWS_UA,
      screenWidth: 1920,
      hasFinePointer: true,
      maxTouchPoints: 0,
    };
    expect(isDesktopDevice(winPc)).toBe(true);
    expect(isMobileDevice(winPc)).toBe(false);
    expect(isTabletDevice(winPc)).toBe(false);
    expect(getDeviceCategory(winPc)).toBe('desktop');

    const macPc: DeviceDetectionOptions = {
      userAgent: DESKTOP_MAC_UA,
      screenWidth: 1440,
      hasFinePointer: true,
      maxTouchPoints: 0,
    };
    expect(isDesktopDevice(macPc)).toBe(true);
    expect(getDeviceCategory(macPc)).toBe('desktop');
  });

  it('identifies iPhone and Android mobile smartphones as mobile devices', () => {
    const iphone: DeviceDetectionOptions = {
      userAgent: IPHONE_UA,
      screenWidth: 393,
      hasFinePointer: false,
      maxTouchPoints: 5,
    };
    expect(isDesktopDevice(iphone)).toBe(false);
    expect(isMobileDevice(iphone)).toBe(true);
    expect(isTabletDevice(iphone)).toBe(false);
    expect(getDeviceCategory(iphone)).toBe('mobile');

    const android: DeviceDetectionOptions = {
      userAgent: ANDROID_PHONE_UA,
      screenWidth: 412,
      hasFinePointer: false,
      maxTouchPoints: 5,
    };
    expect(isDesktopDevice(android)).toBe(false);
    expect(isMobileDevice(android)).toBe(true);
    expect(getDeviceCategory(android)).toBe('mobile');
  });

  it('identifies iPad and touch-enabled tablets as tablet devices', () => {
    const ipad: DeviceDetectionOptions = {
      userAgent: IPAD_UA,
      screenWidth: 820,
      hasFinePointer: false,
      maxTouchPoints: 5,
    };
    expect(isDesktopDevice(ipad)).toBe(false);
    expect(isTabletDevice(ipad)).toBe(true);
    expect(getDeviceCategory(ipad)).toBe('tablet');

    // Modern iPadOS identifies as Macintosh in user agent but has maxTouchPoints > 1
    const ipadOSDesktopUA: DeviceDetectionOptions = {
      userAgent: DESKTOP_MAC_UA,
      screenWidth: 1024,
      hasFinePointer: false,
      maxTouchPoints: 5,
    };
    expect(isDesktopDevice(ipadOSDesktopUA)).toBe(false);
    expect(isTabletDevice(ipadOSDesktopUA)).toBe(true);
  });

  it('categorizes small screen viewports (< 768px) as mobile even with desktop user agent', () => {
    const narrowScreen: DeviceDetectionOptions = {
      userAgent: DESKTOP_WINDOWS_UA,
      screenWidth: 600,
      hasFinePointer: true,
      maxTouchPoints: 0,
    };
    expect(isDesktopDevice(narrowScreen)).toBe(false);
    expect(isMobileDevice(narrowScreen)).toBe(true);
    expect(getDeviceCategory(narrowScreen)).toBe('mobile');
  });

  it('respects forcedDesktop override for developer testing and power users', () => {
    const forcedPhone: DeviceDetectionOptions = {
      userAgent: IPHONE_UA,
      screenWidth: 390,
      forcedDesktop: true,
    };
    expect(isDesktopDevice(forcedPhone)).toBe(true);
    expect(getDeviceCategory(forcedPhone)).toBe('desktop');
  });

  it('renders StudioDesktopGate with desktop PC requirement notice and actions', () => {
    const onReturnHome = vi.fn();
    const onNavigateCatalog = vi.fn();
    const onForceContinue = vi.fn();

    const html = renderToString(
      React.createElement(StudioDesktopGate, {
        onReturnHome,
        onNavigateCatalog,
        onForceContinue,
      })
    );

    expect(html).toContain('PC Desktop Required');
    expect(html).toContain('Mochi Studio is for Desktop');
    expect(html).toContain('The 3D Scene Viewport, Transform Gizmos');
    expect(html).toContain('Back to Home');
    expect(html).toContain('Play Games');
    expect(html).toContain('Copy Link');
    expect(html).toContain('Continue anyway (Experimental)');
    expect(html).toContain('data-testid="studio-desktop-gate"');
    expect(html).toContain('data-testid="gate-return-home"');
  });

  it('renders StudioRouteLoading skeleton screen with dark glassmorphic styling', () => {
    const html = renderToString(React.createElement(StudioRouteLoading));
    expect(html).toContain('data-testid="studio-route-loading"');
    expect(html).toContain('Loading Mochi Studio...');
    expect(html).toContain('Initializing 3D viewport and toolchain');
  });

  it('renders StudioDesktopGate inside StudioRoute when detectionOverride is false', () => {
    const onGamePublished = vi.fn();
    const onReturnHome = vi.fn();

    const html = renderToString(
      React.createElement(StudioRoute, {
        onGamePublished,
        onReturnHome,
        detectionOverride: false,
      })
    );

    expect(html).toContain('data-testid="studio-desktop-gate"');
    expect(html).toContain('Mochi Studio is for Desktop');
  });
});
