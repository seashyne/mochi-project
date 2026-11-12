// Verifies the Studio and Player apps are genuinely separated: separate entry
// documents, separate build targets, and no cross-imports of each other's UI.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function exists(relative: string): boolean {
  return fs.existsSync(path.join(ROOT, relative));
}

describe('Split app: entry documents', () => {
  it('keeps the player document as the PWA entry and points it at the player bundle', () => {
    const html = read('index.html');
    expect(html).toContain('/src/apps/player/main.tsx');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
  });

  it('ships a dedicated studio document that never registers a service worker', () => {
    expect(exists('apps/studio/index.html')).toBe(true);
    const html = read('apps/studio/index.html');
    expect(html).toContain('./main.tsx');
    expect(html).not.toContain('manifest.webmanifest');
  });

  it('gives each app its own entry module', () => {
    expect(read('src/apps/player/main.tsx')).toContain("from '../../App'");
    expect(read('apps/studio/main.tsx')).toContain("from '../../src/apps/studio/StudioApp'");
  });
});

describe('Split app: no UI leakage', () => {
  it('keeps every studio screen out of the player root', () => {
    const app = read('src/App.tsx');
    expect(app).not.toContain('StudioPage');
    expect(app).not.toContain('StudioHub');
    expect(app).not.toContain('components/studio/');
  });

  it('keeps the portal, social and admin surfaces out of the studio root', () => {
    const studio = read('src/apps/studio/StudioApp.tsx');
    expect(studio).not.toContain('AppContent');
    expect(studio).not.toContain('MochiNavbar');
    expect(studio).not.toContain('AdminPortal');
    expect(studio).not.toContain('PlayerViewport');
  });

  it('shares the boot sequence instead of duplicating it', () => {
    expect(read('src/App.tsx')).toContain('useAppBootstrap');
    expect(read('src/apps/studio/StudioApp.tsx')).toContain('useAppBootstrap');
    const bootstrap = read('src/apps/shared/useAppBootstrap.ts');
    expect(bootstrap).toContain('initWasmPhysics');
    expect(bootstrap).toContain('useThemeStore.getState().initTheme()');
  });
});

describe('Split app: build and deploy targets', () => {
  it('emits each app into its own directory', () => {
    const player = read('vite.player.config.ts');
    const studio = read('vite.studio.config.ts');
    expect(player).toContain("outDir: 'dist'");
    expect(studio).toContain("'dist-studio'");
    expect(studio).toContain("'apps/studio'");
  });

  it('wires one worker per app with the matching asset directory', () => {
    const player = read('wrangler.jsonc');
    const studio = read('wrangler.studio.jsonc');
    expect(player).toContain('"./dist"');
    expect(player).toContain('game.lenout.com');
    expect(player).not.toContain('studio-game.lenout.com');
    expect(studio).toContain('"./dist-studio"');
    expect(studio).toContain('studio-game.lenout.com');
  });

  it('exposes a dev script per app', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['dev:player']).toContain('vite.player.config.ts');
    expect(pkg.scripts['dev:studio']).toContain('vite.studio.config.ts');
    expect(pkg.scripts['build:player']).toContain('vite.player.config.ts');
    expect(pkg.scripts['build:studio']).toContain('vite.studio.config.ts');
  });
});

describe('Split app: cross-app handoff', () => {
  it('deep links between the two apps through one shared resolver', () => {
    const routing = read('src/routes/studioRouting.ts');
    expect(routing).toContain('resolvePlayerExternalUrl');
    expect(routing).toContain('resolveStudioExternalUrl');
    expect(routing).toContain('VITE_PLAYER_URL');
    expect(routing).toContain('VITE_STUDIO_URL');
  });

  it('opens the studio from the player instead of mounting it inline', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('resolveStudioExternalUrl');
    expect(app).toContain('window.open(resolveStudioExternalUrl');
  });

  it('opens a published map in the player app from the studio', () => {
    const studio = read('src/apps/studio/StudioApp.tsx');
    expect(studio).toContain('resolvePlayerExternalUrl');
    expect(studio).toContain("'_blank'");
  });

  it('redirects legacy /studio links to the studio app', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('isStudioPathname');
    expect(app).toContain('window.location.href = resolveStudioExternalUrl');
  });
});
