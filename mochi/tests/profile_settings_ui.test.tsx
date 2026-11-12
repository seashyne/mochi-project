// Functional profile and settings surfaces: identity editing, password rotation, share links

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { Language } from '../src/i18n/types';
import { AccountSecurityCard } from '../src/components/settings/AccountSecurityCard';
import { ProfileIdentityCard } from '../src/components/profile/ProfileIdentityCard';
import { ProfileShareCard } from '../src/components/profile/ProfileShareCard';
import { authApi } from '../src/api/auth';
import { ApiClient } from '../src/api/client';
import { UserProfile } from '../src/api/types';

const noop = () => {};

const testUser: UserProfile = {
  id: 'user-uuid-1',
  numericId: 42,
  username: 'mochifan',
  email: 'mochifan@test.dev',
  displayName: 'Mochi Fan',
  role: 'creator',
  isVerified: true
};

function renderLocale(locale: Language, node: React.ReactNode): string {
  return renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('Settings account security card', () => {
  it('renders display name, password rotation, and session controls in English', () => {
    const html = renderLocale(
      'en',
      <AccountSecurityCard user={testUser} onSignOut={noop} onOpenProfile={noop} />
    );
    expect(html).toContain('Display name');
    expect(html).toContain('Current password');
    expect(html).toContain('New password');
    expect(html).toContain('Confirm new password');
    expect(html).toContain('Change password');
    expect(html).toContain('Open profile');
    expect(html).toContain('Sign out');
    expect(html).toContain('Mochi Fan');
  });

  it('renders the account card in Thai', () => {
    const html = renderLocale('th', <AccountSecurityCard user={testUser} onSignOut={noop} />);
    expect(html).toContain('ชื่อที่แสดง');
    expect(html).toContain('เปลี่ยนรหัสผ่าน');
    expect(html).toContain('รหัสผ่านปัจจุบัน');
    expect(html).not.toContain('Change password');
  });

  it('shows a signed-out placeholder without a user', () => {
    const html = renderLocale('en', <AccountSecurityCard user={null} />);
    expect(html).not.toContain('Change password');
  });
});

describe('Profile identity and share cards', () => {
  it('renders self controls: edit name, customize avatar, verified state', () => {
    const html = renderLocale(
      'en',
      <ProfileIdentityCard user={testUser} isSelf onUserUpdated={noop} onOpenAvatar={noop} />
    );
    expect(html).toContain('Edit display name');
    expect(html).toContain('Customize avatar');
    expect(html).toContain('Verified');
    expect(html).toContain('mochifan');
  });

  it('hides self controls when viewing another player', () => {
    const html = renderLocale(
      'en',
      <ProfileIdentityCard user={testUser} isSelf={false} onUserUpdated={noop} onOpenAvatar={noop} />
    );
    expect(html).not.toContain('Edit display name');
    expect(html).not.toContain('Customize avatar');
  });

  it('shows unverified state for accounts without email verification', () => {
    const html = renderLocale(
      'en',
      <ProfileIdentityCard user={{ ...testUser, isVerified: false }} isSelf onUserUpdated={noop} onOpenAvatar={noop} />
    );
    expect(html).toContain('Email not verified');
  });

  it('builds a short numeric-id shareable profile link', () => {
    const html = renderLocale('en', <ProfileShareCard user={testUser} />);
    expect(html).toContain('https://game.lenout.com/profile/42');
    expect(html).toContain('user-uuid-1');
  });
});

describe('Auth client profile and password methods', () => {
  const makeClient = () => {
    const put = vi.fn().mockResolvedValue({ user: testUser });
    const post = vi.fn().mockResolvedValue({ success: true, message: 'Password updated' });
    const client = { put, post, setToken: vi.fn(), getToken: () => 'token', setOnUnauthorized: vi.fn() } as unknown as ApiClient;
    return { client, put, post };
  };

  it('sends display name updates via PUT /me', async () => {
    const { client, put } = makeClient();
    const api = new (authApi.constructor as new (c: ApiClient) => typeof authApi)(client);
    const res = await api.updateProfile('New Name');
    expect(res.user.displayName).toBe('Mochi Fan');
    expect(put).toHaveBeenCalledWith('/api/v1/auth/me', { displayName: 'New Name' });
  });

  it('sends password rotation via POST /change-password', async () => {
    const { client, post } = makeClient();
    const api = new (authApi.constructor as new (c: ApiClient) => typeof authApi)(client);
    const res = await api.changePassword('oldpass1', 'newpass1');
    expect(res.success).toBe(true);
    expect(post).toHaveBeenCalledWith('/api/v1/auth/change-password', {
      currentPassword: 'oldpass1',
      newPassword: 'newpass1'
    });
  });
});
