// Self-hosted font contract.
//
// The shell used to pull two families from the Google Fonts CDN. That put an external
// host in the critical path of "open a link and play", broke behind a firewall, and
// created a consent question. These tests keep the fonts local and keep the licence
// obligations that come with embedding them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'public', 'fonts');
const CSS_PATH = path.join(ROOT, 'src', 'styles', 'fonts.css');

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('self-hosted fonts', () => {
  const css = read(CSS_PATH);

  it('never links a third-party font host from either app shell', () => {
    for (const file of ['index.html', 'apps/studio/index.html']) {
      const html = read(path.join(ROOT, file));
      expect(html, `${file} still references Google Fonts`).not.toMatch(/fonts\.googleapis\.com/);
      expect(html, `${file} still references the font CDN`).not.toMatch(/fonts\.gstatic\.com/);
      expect(html).not.toMatch(/preconnect[^>]*fonts\./);
    }
  });

  it('references only files that exist in public/fonts', () => {
    const referenced = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(0);

    for (const file of referenced) {
      expect(fs.existsSync(path.join(FONT_DIR, file)), `missing font file: ${file}`).toBe(true);
    }
  });

  it('preloads only real font files', () => {
    for (const file of ['index.html', 'apps/studio/index.html']) {
      const html = read(path.join(ROOT, file));
      const preloads = [...html.matchAll(/rel="preload"[^>]*href="\/fonts\/([^"]+)"/g)].map(
        (match) => match[1]
      );
      expect(preloads.length).toBeGreaterThan(0);
      for (const file of preloads) {
        expect(fs.existsSync(path.join(FONT_DIR, file)), `preload of missing file: ${file}`).toBe(true);
      }
    }
  });

  it('ships the licence text OFL requires next to the fonts', () => {
    for (const file of ['OFL-IBM-Plex-Sans-Thai.txt', 'OFL-Mitr.txt']) {
      const licence = read(path.join(FONT_DIR, file));
      expect(licence).toContain('SIL OPEN FONT LICENSE');
      expect(licence).toContain('Version 1.1');
    }
  });

  it('lists both families in the third-party notices', () => {
    const notices = read(path.join(ROOT, 'public', 'THIRD_PARTY_NOTICES.txt'));
    expect(notices).toContain('IBM Plex Sans Thai');
    expect(notices).toContain('Mitr');
    expect(notices).toContain('OFL-1.1');
  });

  it('caches fonts in the service worker and sets a media cache policy', () => {
    const worker = read(path.join(ROOT, 'public', 'sw.js'));
    expect(worker).toMatch(/MEDIA_PREFIXES\s*=\s*\[[^\]]*'\/fonts\/'/);

    const headers = read(path.join(ROOT, 'public', '_headers'));
    expect(headers).toContain('/fonts/*');
    // Stable path, so it must not be immutable: a replaced font would never refresh.
    const block = headers.slice(headers.indexOf('/fonts/*'));
    expect(block.slice(0, 120)).not.toContain('immutable');
  });

  it('only declares families the CSS stacks actually use', () => {
    const families = new Set([...css.matchAll(/font-family: '([^']+)'/g)].map((match) => match[1]));
    expect([...families].sort()).toEqual(['IBM Plex Sans Thai', 'Mitr']);

    // A family named in a stack but never loaded is a silent fallback.
    const shellCss = read(path.join(ROOT, 'src', 'index.css')) + read(path.join(ROOT, 'src', 'styles', 'auth.css'));
    for (const phantom of ['Kanit', 'Prompt', 'IBM Plex Mono', 'Inter']) {
      expect(shellCss, `phantom family still referenced: ${phantom}`).not.toContain(`'${phantom}'`);
    }
  });
});
