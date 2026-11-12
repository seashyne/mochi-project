// Unit tests for modern frictionless player signup and verify-later flow

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QuickSignupForm } from '../src/components/auth/QuickSignupForm';
import { I18nProvider } from '../src/i18n/context';
import { authApi } from '../src/api/auth';
import { ApiClient } from '../src/api/client';

describe('Quick Frictionless Sign Up Form', () => {
  const renderFormHtml = (props: Partial<React.ComponentProps<typeof QuickSignupForm>> = {}) => {
    const defaultProps = {
      onSubmit: vi.fn(),
      onSwitchToSignIn: vi.fn(),
      isLoading: false,
      error: null,
      ...props
    };

    return renderToString(
      <I18nProvider initialLocale="en">
        <QuickSignupForm {...defaultProps} />
      </I18nProvider>
    );
  };

  it('renders birthday selects, username, email, password, and create account button', () => {
    const html = renderFormHtml();

    expect(html).toContain('Birthday');
    expect(html).toContain('<select');
    expect(html).toContain('Day');
    expect(html).toContain('Month');
    expect(html).toContain('Year');
    expect(html).toContain('type="email"');
    expect(html).toContain('3-20 characters');
    expect(html).toContain('At least 6 characters');
    expect(html).toContain('Create Account');
    expect(html).toContain('By creating an account, you agree to our Terms');
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain('Female');
  });

  it('renders error notice when error prop is supplied', () => {
    const html = renderFormHtml({ error: 'Username is already taken' });
    expect(html).toContain('Username is already taken');
  });

  it('renders disabled button with loading status when isLoading is true', () => {
    const html = renderFormHtml({ isLoading: true });
    expect(html).toContain('disabled=""');
  });

  it('triggers email verification link requests in auth client', async () => {
    const mockPost = vi.fn().mockResolvedValue({ success: true, message: 'Code sent', email: 'user@test.com' });
    const mockClient = {
      post: mockPost,
      setToken: vi.fn(),
      getToken: () => 'token',
      setOnUnauthorized: vi.fn()
    } as unknown as ApiClient;
    const testAuthApi = new (authApi.constructor as new (client: ApiClient) => typeof authApi)(mockClient);

    const res = await testAuthApi.requestEmailVerification('user@test.com');
    expect(res.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/request-email-verification', { email: 'user@test.com' });
  });

  it('triggers email verification confirmation in auth client', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      success: true,
      message: 'Verified',
      user: { id: 'u1', username: 'player', email: 'user@test.com', isVerified: true }
    });
    const mockClient = {
      post: mockPost,
      setToken: vi.fn(),
      getToken: () => 'token',
      setOnUnauthorized: vi.fn()
    } as unknown as ApiClient;
    const testAuthApi = new (authApi.constructor as new (client: ApiClient) => typeof authApi)(mockClient);

    const res = await testAuthApi.confirmEmailVerification('user@test.com', '123456');
    expect(res.success).toBe(true);
    expect(res.user.isVerified).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/confirm-email-verification', { email: 'user@test.com', code: '123456' });
  });
});
