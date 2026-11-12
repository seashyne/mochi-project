// M16 CSS Token System: verifies studio-theme.css and tailwind.config.js
// are complete and that no studio components use hardcoded palette colours.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const STUDIO_THEME_CSS = readFileSync(
  join(__dirname, '..', 'src', 'styles', 'studio-theme.css'),
  'utf-8'
);

const TAILWIND_CONFIG = readFileSync(
  join(__dirname, '..', 'tailwind.config.js'),
  'utf-8'
);

describe('M16 CSS Token System', () => {
  it('studio-theme.css defines all surface tokens', () => {
    expect(STUDIO_THEME_CSS).toContain('--studio-bg-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-surface-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-panel-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-ribbon-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-card-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-border-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-muted-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-text-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-accent-rgb');
  });

  it('studio-theme.css defines semantic state tokens', () => {
    expect(STUDIO_THEME_CSS).toContain('--studio-success-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-warning-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-danger-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-info-rgb');
    expect(STUDIO_THEME_CSS).toContain('--studio-violet-rgb');
  });

  it('studio-theme.css has light theme overrides', () => {
    expect(STUDIO_THEME_CSS).toContain('html.light');
    expect(STUDIO_THEME_CSS).toContain('.light');
  });

  it('studio-theme.css defines object-type identity classes', () => {
    expect(STUDIO_THEME_CSS).toContain('.studio-type-block');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-sphere');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-coin');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-hazard');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-terrain');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-constraint');
    expect(STUDIO_THEME_CSS).toContain('.studio-type-particle');
  });

  it('studio-theme.css defines reusable utility classes', () => {
    expect(STUDIO_THEME_CSS).toContain('.studio-chip');
    expect(STUDIO_THEME_CSS).toContain('.studio-input');
    expect(STUDIO_THEME_CSS).toContain('.studio-focus-ring');
  });

  it('tailwind.config.js maps studio colors to CSS variables', () => {
    expect(TAILWIND_CONFIG).toContain('--studio-bg-rgb');
    expect(TAILWIND_CONFIG).toContain('--studio-panel-rgb');
    expect(TAILWIND_CONFIG).toContain('--studio-accent-rgb');
    expect(TAILWIND_CONFIG).toContain('--studio-success-rgb');
    expect(TAILWIND_CONFIG).toContain('--studio-danger-rgb');
    expect(TAILWIND_CONFIG).toContain('--studio-violet-rgb');
  });

  it('no studio component files use raw palette colour utilities', () => {
    const dir = join(__dirname, '..', 'src', 'components', 'studio');
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    const forbidden = /(\b(bg|text|border|accent)-(emerald|amber|rose|violet|indigo|sky|red|green|purple|pink|orange)-[0-9]{3})|text-\[#[0-9a-fA-F]{6}\]|bg-\[#[0-9a-fA-F]{6}\]/;
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(forbidden);
        if (match) violations.push(`${file}:${i + 1}: ${match[0]}`);
      }
    }
    const realViolations = violations.filter((v) => !v.includes('slate'));
    expect(realViolations).toEqual([]);
  });
});
