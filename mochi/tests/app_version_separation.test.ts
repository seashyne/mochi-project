// Multi-App Version Separation and Lifecycle Independence Test Suite
// Verifies explicit semver boundaries across Mochi Web, Studio, Engine, Mobile, and Cloud API

import { describe, it, expect } from 'vitest';
import {
  MOCHI_VERSIONS,
  getAppVersionInfo,
  getActiveAppVersion,
  formatVersionBadge
} from '../src/config/version';

describe('App Version Separation: Independent Release Cycles', () => {
  it('defines distinct, isolated app IDs and semantic version numbers', () => {
    expect(MOCHI_VERSIONS.web.appId).toBe('mochi-web');
    expect(MOCHI_VERSIONS.studio.appId).toBe('mochi-studio');
    expect(MOCHI_VERSIONS.engine.appId).toBe('mochi-engine');
    expect(MOCHI_VERSIONS.cloud.appId).toBe('mochi-cloud');
    expect(MOCHI_VERSIONS.mobile.appId).toBe('mochi-mobile');

    // Invariant: Studio and Web versions must not be conflated as a single generic version
    expect(MOCHI_VERSIONS.studio.version).not.toBe(MOCHI_VERSIONS.web.version);
    expect(MOCHI_VERSIONS.studio.appId).not.toBe(MOCHI_VERSIONS.web.appId);
  });

  it('provides comprehensive version information via getAppVersionInfo', () => {
    const studioInfo = getAppVersionInfo('studio');
    expect(studioInfo.name).toBe('Mochi Studio');
    expect(studioInfo.version).toBe('1.0.0-creator');
    expect(studioInfo.channel).toBe('beta');

    const webInfo = getAppVersionInfo('web');
    expect(webInfo.name).toBe('Mochi Web Portal');
    expect(webInfo.version).toBe('1.2.0');
    expect(webInfo.channel).toBe('stable');

    const engineInfo = getAppVersionInfo('engine');
    expect(engineInfo.name).toBe('Mochi 3D Engine');
    expect(engineInfo.version).toBe('0.9.5');

    const mobileInfo = getAppVersionInfo('mobile');
    expect(mobileInfo.name).toBe('Mochi Mobile App');
    expect(mobileInfo.version).toBe('1.0.0');
  });

  it('resolves active application version based on environment and explicit flags', () => {
    expect(getActiveAppVersion(true).appId).toBe('mochi-studio');
    expect(getActiveAppVersion(false).appId).toBe('mochi-web');
  });

  it('formats standardized user-facing version badges', () => {
    expect(formatVersionBadge(MOCHI_VERSIONS.studio)).toBe('Mochi Studio v1.0.0-creator');
    expect(formatVersionBadge(MOCHI_VERSIONS.web)).toBe('Mochi Web Portal v1.2.0');
    expect(formatVersionBadge(MOCHI_VERSIONS.engine)).toBe('Mochi 3D Engine v0.9.5');
  });
});
