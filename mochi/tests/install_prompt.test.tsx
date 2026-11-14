import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstallPrompt } from '../src/components/InstallPrompt';
import { I18nProvider } from '../src/i18n/context';
import { bundledCatalog } from '../src/i18n/registry';
import { SUPPORTED_LANGUAGES, type Language } from '../src/i18n/types';
import { INSTALL_DISMISS_MS, isInstallDismissed, isIosSafari } from '../src/pwa/useInstallPrompt';

function renderPrompt(lang: Language, props: Partial<React.ComponentProps<typeof InstallPrompt>> = {}) {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={lang}>
      <InstallPrompt mode="native" busy={false} failed={false} onInstall={vi.fn()} onDismiss={vi.fn()} {...props} />
    </I18nProvider>
  );
}

const safari = 'Version/18.0 Mobile/15E148 Safari/604.1';

describe('install eligibility and cooldown', () => {
  it.each([null, '', 'bad', 'Infinity', '-1', '1000'])('does not suppress for an absent, invalid or expired timestamp: %s', (value) => {
    expect(isInstallDismissed(value, 1000)).toBe(false);
  });

  it('suppresses for seven days and allows a prompt at expiry', () => {
    const now = 1000;
    const until = String(now + INSTALL_DISMISS_MS);
    expect(INSTALL_DISMISS_MS).toBe(604800000);
    expect(isInstallDismissed(until, now)).toBe(true);
    expect(isInstallDismissed(until, now + INSTALL_DISMISS_MS - 1)).toBe(true);
    expect(isInstallDismissed(until, now + INSTALL_DISMISS_MS)).toBe(false);
  });

  it('recognizes iPhone Safari and desktop-mode iPad Safari', () => {
    expect(isIosSafari({ userAgent: `iPhone ${safari}`, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIosSafari({ userAgent: `Macintosh ${safari}`, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIosSafari({ userAgent: `Macintosh ${safari}`, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it.each(['CriOS', 'FxiOS', 'EdgiOS', 'OPiOS', 'GSA', 'DuckDuckGo'])('does not show Safari instructions in %s', (browser) => {
    expect(isIosSafari({ userAgent: `iPhone ${browser}/130 ${safari}`, platform: 'iPhone', maxTouchPoints: 5 })).toBe(false);
  });

  it('excludes embedded iOS webviews and Android browsers', () => {
    expect(isIosSafari({ userAgent: 'iPhone AppleWebKit/605.1.15 Mobile/15E148', platform: 'iPhone', maxTouchPoints: 5 })).toBe(false);
    expect(isIosSafari({ userAgent: 'Android Chrome/130 Safari/537.36', platform: 'Linux', maxTouchPoints: 5 })).toBe(false);
  });
});

describe.each(SUPPORTED_LANGUAGES)('install prompt in $code', ({ code }) => {
  it('renders localized title, benefits and accessible actions', () => {
    const html = renderPrompt(code);
    const t = bundledCatalog(code).install;
    expect(html).toContain(t.title);
    expect(html).toContain(t.desc);
    expect(html).toContain(t.installBtn);
    expect(html).toContain(t.notNow);
    expect(html).toContain('aria-labelledby=');
    expect(html).not.toContain(t.iosHint);
  });

  it('shows Safari instructions without a fake install button', () => {
    const html = renderPrompt(code, { mode: 'ios' });
    const t = bundledCatalog(code).install;
    expect(html).toContain(t.iosTitle);
    expect(html).toContain(t.iosHint);
    expect(html).not.toContain(t.installBtn);
  });

  it('disables the action while the browser prompt is pending', () => {
    const html = renderPrompt(code, { busy: true });
    expect(html).toContain(bundledCatalog(code).install.installing);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it('shows localized recovery guidance on failure without reusing the event', () => {
    const html = renderPrompt(code, { failed: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain(bundledCatalog(code).install.failed);
    expect(html).not.toContain(bundledCatalog(code).install.installBtn);
  });

  it('renders nothing when unavailable or hidden behind a game or dialog', () => {
    expect(renderPrompt(code, { mode: null })).toBe('');
    expect(renderPrompt(code, { hidden: true })).toBe('');
  });
});
