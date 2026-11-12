// Tier 5 adversarial tests: access asset origin resolution. The dedicated
// access domain must be swappable by configuration alone so a domain migration
// never touches component code.

import { describe, it, expect } from 'vitest';
import {
  resolveAccessAssetHost,
  resolveAccessAssetUrl,
  resolveAssetBase
} from '../src/config/assets';

describe('Tier 5: Access Asset Domain Hardening', () => {
  it('falls back to same-origin in non-production builds', () => {
    expect(resolveAccessAssetHost()).toBe('');
  });

  it('leaves relative paths untouched when the host is empty', () => {
    expect(resolveAccessAssetUrl('/assets/sha256/abc', '')).toBe('/assets/sha256/abc');
    expect(resolveAccessAssetUrl('assets/sha256/abc', '')).toBe('/assets/sha256/abc');
  });

  it('prefixes the configured access host', () => {
    expect(resolveAccessAssetUrl('/assets/sha256/abc', 'https://access-game.lenout.com')).toBe(
      'https://access-game.lenout.com/assets/sha256/abc'
    );
  });

  it('normalises trailing slashes on the host', () => {
    expect(resolveAccessAssetUrl('/assets/x.png', 'https://access-game.lenout.com/')).toBe(
      'https://access-game.lenout.com/assets/x.png'
    );
  });

  it('never rewrites absolute URLs, so a migrated CDN keeps working', () => {
    expect(
      resolveAccessAssetUrl('https://cdn.example.net/assets/x.png', 'https://access-game.lenout.com')
    ).toBe('https://cdn.example.net/assets/x.png');
  });

  it('returns empty input unchanged', () => {
    expect(resolveAccessAssetUrl('', 'https://access-game.lenout.com')).toBe('');
  });

  it('keeps bundled asset base separate from the access host', () => {
    expect(resolveAssetBase()).toBe('');
    expect(resolveAssetBase()).not.toBe('https://access-game.lenout.com');
  });
});
