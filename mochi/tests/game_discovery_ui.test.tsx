// Game discovery UI tests: cover thumbnails, semantic article cards, spotlight hero, and Thai/EN filters

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { Language } from '../src/i18n/types';
import { DashboardHome } from '../src/components/DashboardHome';
import { GameCatalog } from '../src/components/GameCatalog';
import { GameCard3D } from '../src/components/home/GameCard3D';
import { INITIAL_GAMES } from '../src/api/catalogDefaults';

function renderLocale(locale: Language, node: React.ReactNode): string {
  return renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('Game Discovery & Selection UI', () => {
  it('renders semantic <article> card with 3D cover image and accessible button trigger', () => {
    const html = renderLocale(
      'en',
      <GameCard3D game={INITIAL_GAMES[0]} index={0} tag="PARKOUR // 3D" onPlay={() => {}} />
    );
    expect(html).toContain('<article class="mochi-game-card');
    expect(html).toContain('/landing/thumb-obby.jpg');
    expect(html).toContain('mochi-game-card-trigger');
    expect(html).toContain('Neon Sky Obby');
    expect(html).toContain('Play Now');
  });

  it('renders DashboardHome spotlight card, cover thumbnails, and Thai genre filters', () => {
    const html = renderLocale(
      'th',
      <DashboardHome games={INITIAL_GAMES} onPlayGame={() => {}} onNavigateTab={() => {}} />
    );
    expect(html).toContain('เกมแนะนำวันนี้');
    expect(html).toContain('Cyber Drift 3D');
    expect(html).toContain('/landing/thumb-arena.jpg');
    expect(html).toContain('/landing/thumb-tycoon.jpg');
    expect(html).toContain('/landing/thumb-obby.jpg');
    expect(html).toContain('ทั้งหมด');
    expect(html).toContain('ปาร์กูร์');
    expect(html).toContain('ไทคูน');
    expect(html).toContain('อารีนา');
    expect(html).toContain('aria-pressed="true"');
  });

  it('renders GameCatalog with localized filter pills, search, sort selector, and artwork cards', () => {
    const html = renderLocale(
      'th',
      <GameCatalog games={INITIAL_GAMES} onPlayGame={() => {}} />
    );
    expect(html).toContain('3 เวิลด์');
    expect(html).toContain('แนะนำ');
    expect(html).toContain('<article class="mochi-game-card');
    expect(html).toContain('/landing/thumb-arena.jpg');
  });
});
