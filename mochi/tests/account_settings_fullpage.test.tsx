// Full-page Pro Account & Settings Hub: layout sections, accessible controls, and profile route parsing

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { Language } from '../src/i18n/types';
import { SettingsPage } from '../src/pages/SettingsPage';
import { AccountSecurityCard } from '../src/components/settings/AccountSecurityCard';
import { ProfileShareCard } from '../src/components/profile/ProfileShareCard';
import { UserProfile } from '../src/api/types';
import {
  getNavTabFromPathname,
  parseProfilePathname,
  resolveNavPath
} from '../src/routes/studioRouting';

const testUser: UserProfile = {
  id: 'user-uuid-1',
  numericId: 10002,
  username: 'seashyne',
  email: 'seashyne@test.dev',
  displayName: 'seashyne',
  role: 'creator',
  isVerified: true
};

function renderLocale(locale: Language, node: React.ReactNode): string {
  return renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('Pro Full-page Account & Settings Hub', () => {
  it('renders semantic navigation rail and profile section without popup overlay in English', () => {
    const html = renderLocale(
      'en',
      <SettingsPage user={testUser} initialSection="profile" onSignOut={() => {}} />
    );
    expect(html).toContain('Account Center');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Profile &amp; Worlds');
    expect(html).toContain('Security &amp; Login');
    expect(html).toContain('Appearance &amp; Language');
    expect(html).toContain('Data &amp; System');
    expect(html).toContain('https://game.lenout.com/profile/10002');
    expect(html).toContain('user-uuid-1');
    expect(html).not.toContain('fixed inset-0 z-50');
  });

  it('renders the Pro Account Hub in Thai when opened on security section', () => {
    const html = renderLocale(
      'th',
      <SettingsPage user={testUser} initialSection="security" onSignOut={() => {}} />
    );
    expect(html).toContain('ศูนย์จัดการบัญชี');
    expect(html).toContain('โปรไฟล์และเวิลด์');
    expect(html).toContain('ความปลอดภัยและรหัสผ่าน');
    expect(html).toContain('เปลี่ยนรหัสผ่าน');
  });

  it('renders accessible password visibility toggles and labels on AccountSecurityCard', () => {
    const html = renderLocale('en', <AccountSecurityCard user={testUser} onSignOut={() => {}} />);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Show password (Current password)');
    expect(html).toContain('Show password (New password)');
    expect(html).toContain('Show password (Confirm new password)');
  });

  it('renders non-disabled copy buttons with aria-live status region in ProfileShareCard', () => {
    const html = renderLocale('en', <ProfileShareCard user={testUser} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Copy Canonical Player UUID"');
    expect(html).toContain('aria-label="Copy Shareable Profile URL"');
  });
});

describe('Full-page /profile route resolution', () => {
  it('maps /profile and /profile/:id to the profile tab and identifier', () => {
    expect(resolveNavPath('profile')).toBe('/profile');
    expect(getNavTabFromPathname('/profile')).toBe('profile');
    expect(getNavTabFromPathname('/profile/10002')).toBe('profile');
    expect(parseProfilePathname('/profile')).toEqual({ isProfile: true, identifier: null });
    expect(parseProfilePathname('/profile/10002')).toEqual({ isProfile: true, identifier: '10002' });
    expect(parseProfilePathname('/settings')).toEqual({ isProfile: false, identifier: null });
  });
});
