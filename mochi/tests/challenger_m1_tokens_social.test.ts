// Empirical Challenger Adversarial Test Suite: Milestone 1
// Verifies Design Tokens, WCAG Contrast/Luminance, and FriendsBar Edge States

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { I18nProvider } from '../src/i18n/context';
import { FriendsBar, FriendEntry } from '../src/components/FriendsBar';

let mockCurrentUser: any = null;

vi.mock('../src/store/useAuthStore', () => ({
  useAuthStore: (selector?: (state: any) => any) => {
    const state = {
      user: mockCurrentUser,
      token: mockCurrentUser ? 'mock_token' : null,
      isInitialized: true,
      isLoading: false,
      error: null
    };
    return typeof selector === 'function' ? selector(state) : state;
  }
}));

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function renderFriendsBar(props: { friends?: FriendEntry[] } = {}) {
  return renderToString(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FriendsBar, props)
    )
  );
}

describe('Empirical Adversarial Challenge: Milestone 1', () => {
  beforeEach(() => {
    mockCurrentUser = null;
  });

  describe('1. WCAG 2.1 Luminance & Contrast Ratios', () => {
    it('confirms studio dark theme background tones have low-glare luminance (< 0.03)', () => {
      const darkTokens = ['#1e1e24', '#222228', '#25252b', '#282830', '#2a2a32'];
      for (const hex of darkTokens) {
        expect(relativeLuminance(hex)).toBeLessThan(0.03);
      }
    });

    it('confirms primary text (#ededf2) exceeds WCAG AAA standard (>= 7.0:1) on all dark backgrounds', () => {
      const surfaces = ['#1e1e24', '#222228', '#25252b', '#282830', '#2a2a32'];
      for (const surface of surfaces) {
        expect(contrastRatio('#ededf2', surface)).toBeGreaterThanOrEqual(12.0);
      }
    });

    it('confirms muted text (#a0a0ab) satisfies WCAG AA standard (>= 4.5:1) on all dark backgrounds', () => {
      const surfaces = ['#1e1e24', '#222228', '#25252b', '#282830', '#2a2a32'];
      for (const surface of surfaces) {
        expect(contrastRatio('#a0a0ab', surface)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('preserves backward compatibility tokens in tailwind.config.js and index.css', () => {
      const tailwindContent = fs.readFileSync(path.resolve(__dirname, '../tailwind.config.js'), 'utf8');
      expect(tailwindContent).toContain('#090b10');
      expect(tailwindContent).toContain('studio:');
      expect(tailwindContent).toContain('#1e1e24');

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8');
      expect(cssContent).toContain('--mochi-bg: #090b10;');
      expect(cssContent).toContain('--studio-bg: #1e1e24;');
      expect(cssContent).toContain('--studio-panel: #25252b;');
    });
  });

  describe('2. FriendsBar Unauthenticated / Guest Edge States', () => {
    it('renders clean guest empty state without throwing when user is null', () => {
      const html = renderFriendsBar();
      expect(html).toContain('Sign in to view friends and online presence');
      expect(html).toContain('0'); // active count
      expect(html).not.toContain('No friends online yet');
    });

    it('does not leak user card when user is null', () => {
      const html = renderFriendsBar();
      expect(html).not.toContain('mochi-avatar-frame');
    });

    it('renders add friend trigger button for guest users', () => {
      const html = renderFriendsBar();
      expect(html).toContain('button');
      expect(html).toContain('dark:border-studio-border');
    });
  });

  describe('3. FriendsBar Authenticated 0-Friends Edge States', () => {
    it('renders dedicated empty friends state and authenticated user card', () => {
      mockCurrentUser = {
        id: 'u_challenger',
        numericId: 999,
        username: 'darkKnight',
        email: 'knight@mochi.gg',
        displayName: null,
        role: 'member'
      };

      const html = renderFriendsBar();
      expect(html).toContain('No friends online yet');
      expect(html).not.toContain('Sign in to view friends');
      expect(html).toContain('darkKnight');
      expect(html).toContain('DA'); // Initials of darkKnight
      expect(html).toContain('1'); // Active count = 1 (user online)
    });

    it('prefers displayName over username and produces correct initials', () => {
      mockCurrentUser = {
        id: 'u_display',
        numericId: 1000,
        username: 'hiddenUsername',
        email: 'user@mochi.gg',
        displayName: 'Neon Striker',
        role: 'member'
      };

      const html = renderFriendsBar();
      expect(html).toContain('Neon Striker');
      expect(html).not.toContain('hiddenUsername');
      expect(html).toContain('NE'); // Initials of Neon Striker
    });

    it('falls back to username when displayName is an empty string', () => {
      mockCurrentUser = {
        id: 'u_fallback',
        numericId: 1001,
        username: 'fallbackHero',
        email: 'hero@mochi.gg',
        displayName: '',
        role: 'member'
      };

      const html = renderFriendsBar();
      expect(html).toContain('fallbackHero');
      expect(html).toContain('FA'); // Initials of fallbackHero
    });

    it('assigns gold avatar tier for admin users', () => {
      mockCurrentUser = {
        id: 'u_admin',
        numericId: 1,
        username: 'sysAdmin',
        email: 'admin@mochi.gg',
        displayName: null,
        role: 'admin'
      };

      const html = renderFriendsBar();
      expect(html).toContain('from-amber-300'); // gold tier ring
    });
  });

  describe('4. FriendsBar Real Friends Active Presence', () => {
    it('correctly calculates active friend presence and renders friend cards', () => {
      mockCurrentUser = {
        id: 'u_host',
        numericId: 10,
        username: 'hostPlayer',
        email: 'host@mochi.gg',
        displayName: null,
        role: 'member'
      };

      const mockRealFriends: FriendEntry[] = [
        {
          id: 'f1',
          name: 'OnlineFriend',
          statusText: 'In Lobby',
          presence: 'online',
          tier: 'silver',
          innerGradient: 'from-slate-800 to-slate-900'
        },
        {
          id: 'f2',
          name: 'InGameFriend',
          statusText: 'Playing Obby',
          presence: 'in_game',
          tier: 'cyber',
          innerGradient: 'from-emerald-900 to-slate-900'
        },
        {
          id: 'f3',
          name: 'OfflineFriend',
          statusText: 'Last seen 2h ago',
          presence: 'offline',
          tier: 'bronze',
          innerGradient: 'from-amber-900 to-slate-900'
        }
      ];

      const html = renderFriendsBar({ friends: mockRealFriends });
      // Active count = 1 (user) + 2 (active friends f1 & f2) = 3
      expect(html).toContain('3');
      expect(html).toContain('OnlineFriend');
      expect(html).toContain('InGameFriend');
      expect(html).toContain('OfflineFriend');
      expect(html).not.toContain('No friends online yet');
    });
  });

  describe('5. Complete Mock Roster Purge Verification', () => {
    it('verifies none of the 10 legacy dummy profiles exist in rendered output', () => {
      const htmlGuest = renderFriendsBar();
      mockCurrentUser = {
        id: 'u1',
        numericId: 2,
        username: 'cleanUser',
        email: 'clean@mochi.gg',
        displayName: null,
        role: 'member'
      };
      const htmlUser = renderFriendsBar();

      const legacyDummyProfiles = [
        'Astra',
        'Pete',
        'NutyoOU',
        '\u0e17\u0e34\u0e27',
        'spirte1122',
        'Lycan',
        'Machiko',
        'Banana',
        'NongDA',
        'chance'
      ];

      for (const dummy of legacyDummyProfiles) {
        expect(htmlGuest).not.toContain(dummy);
        expect(htmlUser).not.toContain(dummy);
      }
    });

    it('verifies FRIENDS_ROSTER is completely absent from FriendsBar source code', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../src/components/FriendsBar.tsx'), 'utf8');
      expect(src).not.toContain('FRIENDS_ROSTER');
    });
  });
});
