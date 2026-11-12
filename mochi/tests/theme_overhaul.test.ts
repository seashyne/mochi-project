// Unit Test Suite for Mochi Dark Minimalist Gaming Theme & 3D Portal Overhaul
// Verifies semantic design tokens, glassmorphic CSS utilities, gaming UI primitives,
// AuthModal real-email Sign Up contract, zero emojis, zero legacy strings, and <= 300 line SRP ceiling.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AvatarFrame, AVATAR_TIER_STYLES } from '../src/components/common/AvatarFrame';
import { PresenceBadge, PRESENCE_STATUS_CONFIG } from '../src/components/common/PresenceBadge';
import { PortalHeroCanvas } from '../src/components/hero/PortalHeroCanvas';
import { PlayerControlsBar } from '../src/components/player/PlayerControlsBar';
import { PlayerChatDrawer } from '../src/components/player/PlayerChatDrawer';

describe('Mochi Dark Gaming UI & 3D Portal Overhaul Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  const OWNED_FILES = [
    'tailwind.config.js',
    'src/index.css',
    'src/components/hero/PortalHeroCanvas.tsx',
    'src/components/LandingHero.tsx',
    'src/components/common/AvatarFrame.tsx',
    'src/components/common/PresenceBadge.tsx',
    'src/components/FriendsBar.tsx',
    'src/components/DashboardHome.tsx',
    'src/components/GameCatalog.tsx',
    'src/components/AuthModal.tsx',
    'src/components/auth/OtpVerificationStep.tsx',
    'src/components/UserProfileModal.tsx',
    'src/components/Footer.tsx',
    'src/components/player/PlayerControlsBar.tsx',
    'src/components/player/PlayerChatDrawer.tsx',
    'src/components/PlayerViewport.tsx',
    'tests/theme_overhaul.test.ts'
  ];

  const EMOJI_PATTERN =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
  const LEGACY_BRAND = ['r', 'o', 'b', 'l', 'o', 'x'].join('');
  const LEGACY_PREFIX = ['r', 'b', 'x'].join('');

  it('defines semantic Mochi dark palette and neon glow shadows in tailwind.config.js', () => {
    const content = fs.readFileSync(path.join(rootDir, 'tailwind.config.js'), 'utf8');
    expect(content).toContain('#090b10');
    expect(content).toContain('#0e1118');
    expect(content).toContain('#131722');
    expect(content).toContain('#161b26');
    expect(content).toContain('#1d2433');
    expect(content).toContain('#00a2ff');
    expect(content).toContain('#38bdf8');
    expect(content).toContain('#6366f1');
    expect(content).toContain('#10b981');
    expect(content).toContain('#f59e0b');
    expect(content).toContain('boxShadow');
  });

  it('defines glassmorphic panels, neon glow cards, dark inputs, and custom scrollbars in src/index.css', () => {
    const css = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8');
    expect(css).toContain('--mochi-bg: #090b10');
    expect(css).toContain('--mochi-surface:');
    expect(css).toContain('--mochi-panel:');
    expect(css).toContain('--mochi-card:');
    expect(css).toContain('--mochi-border:');
    expect(css).toContain('--mochi-glow-cyan:');
    expect(css).toContain('.mochi-glass-panel');
    expect(css).toContain('.mochi-card-glow');
    expect(css).toContain('.mochi-input');
    expect(css).toContain('.mochi-btn-primary');
    expect(css).toContain('.mochi-btn-secondary');
    expect(css).toContain('.mochi-ambient-mesh');
    expect(css).toContain('::-webkit-scrollbar');
  });

  it('exports AvatarFrame and PresenceBadge with full rank tiers and presence status configs', () => {
    expect(typeof AvatarFrame).toBe('function');
    expect(Object.keys(AVATAR_TIER_STYLES).sort()).toEqual(['bronze', 'cyber', 'gold', 'silver']);

    expect(typeof PresenceBadge).toBe('function');
    expect(Object.keys(PRESENCE_STATUS_CONFIG).sort()).toEqual([
      'in_game',
      'offline',
      'online',
      'studio'
    ]);
    expect(PRESENCE_STATUS_CONFIG.online.isActive).toBe(true);
    expect(PRESENCE_STATUS_CONFIG.in_game.isActive).toBe(true);
    expect(PRESENCE_STATUS_CONFIG.studio.isActive).toBe(true);
    expect(PRESENCE_STATUS_CONFIG.offline.isActive).toBe(false);
  });

  it('exports PortalHeroCanvas, PlayerControlsBar, and PlayerChatDrawer with WebGL safety', () => {
    expect(typeof PortalHeroCanvas).toBe('function');
    expect(typeof PlayerControlsBar).toBe('function');
    expect(typeof PlayerChatDrawer).toBe('function');

    const portalSource = fs.readFileSync(
      path.join(rootDir, 'src/components/hero/PortalHeroCanvas.tsx'),
      'utf8'
    );
    expect(portalSource).toContain('try {');
    expect(portalSource).toContain('cancelAnimationFrame');
    expect(portalSource).toContain('.dispose()');
  });

  it('verifies AuthModal syncs initialMode and exposes dedicated email + username inputs in Sign Up', () => {
    const authSource = fs.readFileSync(
      path.join(rootDir, 'src/components/AuthModal.tsx'),
      'utf8'
    );
    expect(authSource).toContain('[isOpen, initialMode]');
    expect(authSource).toContain('type="email"');
    expect(authSource).toContain('minLength={3}');
  });

  it('enforces <= 300 lines, zero emojis, and zero legacy brand strings across all owned files', () => {
    const brandRegex = new RegExp(LEGACY_BRAND, 'i');
    const prefixRegex = new RegExp(LEGACY_PREFIX, 'i');

    for (const relFile of OWNED_FILES) {
      const fullPath = path.join(rootDir, relFile);
      expect(fs.existsSync(fullPath), `Missing file: ${relFile}`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      expect(lines.length, `${relFile} exceeds 300 lines (${lines.length})`).toBeLessThanOrEqual(
        300
      );

      lines.forEach((line, index) => {
        expect(
          EMOJI_PATTERN.test(line),
          `Emoji detected in ${relFile}:${index + 1}`
        ).toBe(false);
        expect(
          brandRegex.test(line),
          `Legacy brand detected in ${relFile}:${index + 1}`
        ).toBe(false);
        expect(
          prefixRegex.test(line),
          `Legacy prefix detected in ${relFile}:${index + 1}`
        ).toBe(false);
      });
    }
  });
});
