// Multi-language auth flow rendering tests across English and Thai locales.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { Language } from '../src/i18n/types';
import { ForgotPasswordStep } from '../src/components/auth/ForgotPasswordStep';
import { EmailCodeLoginStep } from '../src/components/auth/EmailCodeLoginStep';
import { QrLoginStep } from '../src/components/auth/QrLoginStep';
import { QuickSignupForm } from '../src/components/auth/QuickSignupForm';

const noop = () => {};

function renderLocale(locale: Language, node: React.ReactNode): string {
  return renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('auth flow multi-language rendering', () => {
  it('renders the forgot-password step in English', () => {
    const html = renderLocale(
      'en',
      <ForgotPasswordStep onSuccess={noop} onBack={noop} />
    );
    expect(html).toContain('Enter your registered email');
    expect(html).toContain('Send Reset Code');
  });

  it('renders the forgot-password step in Thai without English copy', () => {
    const html = renderLocale(
      'th',
      <ForgotPasswordStep onSuccess={noop} onBack={noop} />
    );
    expect(html).toContain('กรอกอีเมลที่ลงทะเบียนไว้');
    expect(html).toContain('ส่งรหัสรีเซ็ต');
    expect(html).not.toContain('Send Reset Code');
  });

  it('renders the email-code login step in Thai and Japanese', () => {
    const thai = renderLocale('th', <EmailCodeLoginStep onSuccess={noop} onBack={noop} />);
    expect(thai).toContain('เข้าสู่ระบบทันทีโดยไม่ต้องใช้รหัสผ่าน');
    expect(thai).not.toContain('Sign in instantly');

    const japanese = renderLocale('ja', <EmailCodeLoginStep onSuccess={noop} onBack={noop} />);
    expect(japanese).toContain('ログインコードを送信');
  });

  it('renders the QR step in Chinese', () => {
    const html = renderLocale('zh', <QrLoginStep onSuccess={noop} onBack={noop} />);
    expect(html).toContain('使用 Mochi 手机应用扫描');
    expect(html).toContain('以测试玩家身份授权');
    expect(html).not.toContain('Authorize as Test Player');
  });

  it('renders localized password toggle labels and sign-up hints', () => {
    const english = renderLocale(
      'en',
      <QuickSignupForm onSubmit={noop} onSwitchToSignIn={noop} isLoading={false} error={null} />
    );
    expect(english).toContain('Show password');
    expect(english).toContain('Birthday');

    const thai = renderLocale(
      'th',
      <QuickSignupForm onSubmit={noop} onSwitchToSignIn={noop} isLoading={false} error={null} />
    );
    expect(thai).toContain('แสดงรหัสผ่าน');
    expect(thai).toContain('วันเกิด');
    expect(thai).not.toContain('Birthday');
  });
});
