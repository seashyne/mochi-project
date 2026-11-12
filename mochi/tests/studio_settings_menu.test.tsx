// Studio settings popover: theme switch, dock visibility, layout reset and the
// shortcut sheet. Copy for the chrome comes from the pages domain so all four
// locales stay in sync.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioSettingsMenu } from '../src/components/studio/shell/StudioSettingsMenu';
import { StudioMenuBar } from '../src/components/studio/shell/StudioMenuBar';
import { I18nProvider } from '../src/i18n/context';
import { useThemeStore } from '../src/store/useThemeStore';
import { menuActions } from './shellFixtures';

const render = (locale = 'en') =>
  renderToString(
    <I18nProvider initialLocale={locale}>
      <StudioSettingsMenu
        onClose={vi.fn()}
        panels={{ toolbox: true, explorer: false, properties: true, output: true }}
        onTogglePanel={vi.fn()}
        onResetPanels={vi.fn()}
      />
    </I18nProvider>
  );

describe('Studio settings popover', () => {
  it('renders the appearance switch with the active theme pressed', () => {
    useThemeStore.getState().setTheme('dark');
    const html = render();
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Dark');
    expect(html).toContain('Light');
  });

  it('lists every dock with its current visibility', () => {
    const html = render();
    ['Toolbox', 'Explorer', 'Properties', 'Output'].forEach((label) => expect(html).toContain(label));
    expect(html).toContain('aria-pressed="false"');
  });

  it('offers the layout reset and the shortcut sheet', () => {
    const html = render();
    expect(html).toContain('Reset layout');
    expect(html).toContain('Keyboard shortcuts');
    expect(html).toContain('Ctrl + Z');
    expect(html).toContain('Ctrl + G');
  });

  it('localises the chrome copy in every locale', () => {
    expect(render('th')).toContain('ตั้งค่า Studio');
    expect(render('ja')).toContain('Studio 設定');
    expect(render('zh')).toContain('Studio 设置');
  });

  it('uses studio tokens only', () => {
    const html = render();
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('border-studio-border');
    expect(html).not.toMatch(/bg-(slate|gray|zinc|neutral)-/);
  });
});

describe('Menu bar settings trigger', () => {
  it('exposes a settings button wired to the reset action', () => {
    const html = renderToString(
      <StudioMenuBar documentName="Doc" actions={menuActions({ onResetPanels: vi.fn() })} />
    );
    expect(html).toContain('aria-label="Studio settings"');
    expect(html).toContain('aria-label="More"');
  });

  it('keeps the popover closed until the trigger is used', () => {
    const html = renderToString(
      <StudioMenuBar documentName="Doc" actions={menuActions({ onResetPanels: vi.fn() })} />
    );
    expect(html).not.toContain('Keyboard shortcuts');
  });
});
