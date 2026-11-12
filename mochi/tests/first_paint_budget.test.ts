// Guards the first-paint budget: the portal shell must not statically import
// anything that drags in three.js, the Lua VM or the admin tools. Every such
// screen has to stay behind a dynamic import so visitors on the landing page
// never download them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Matches a top-level static import of the given module specifier. */
function hasStaticImport(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^import[^;]*from '${escaped}';`, 'm').test(source);
}

describe('First paint budget: heavy screens stay lazy', () => {
  it('keeps the game viewport behind a dynamic import', () => {
    const appContent = read('src/components/AppContent.tsx');
    expect(hasStaticImport(appContent, './PlayerViewport')).toBe(false);
    expect(appContent).toContain("import('./PlayerViewport')");
  });

  it('keeps the admin portal and shop behind dynamic imports', () => {
    const appContent = read('src/components/AppContent.tsx');
    expect(hasStaticImport(appContent, './admin/AdminPortal')).toBe(false);
    expect(hasStaticImport(appContent, './shop/ShopPage')).toBe(false);
    expect(appContent).toContain("import('./admin/AdminPortal')");
    expect(appContent).toContain("import('./shop/ShopPage')");
  });

  it('keeps the avatar editor behind a dynamic import in both entry points', () => {
    for (const file of ['src/components/Sidebar.tsx', 'src/components/UserProfileModal.tsx']) {
      const source = read(file);
      expect(hasStaticImport(source, './avatar/AvatarEditorModal'), `${file} still imports the editor eagerly`).toBe(false);
      expect(source, `${file} is missing the dynamic import`).toContain("import('./avatar/AvatarEditorModal')");
    }
  });

  it('never imports three.js from a component that is always mounted', () => {
    const alwaysMounted = [
      'src/App.tsx',
      'src/components/AppContent.tsx',
      'src/components/MochiNavbar.tsx',
      'src/components/Sidebar.tsx',
      'src/components/Footer.tsx'
    ];
    for (const file of alwaysMounted) {
      const source = read(file);
      expect(source.includes("from 'three'"), `${file} pulls three.js into the first paint`).toBe(false);
    }
  });

  it('keeps the landing, dashboard and catalog eager so the common path is instant', () => {
    const appContent = read('src/components/AppContent.tsx');
    expect(hasStaticImport(appContent, './LandingHero')).toBe(true);
    expect(hasStaticImport(appContent, './DashboardHome')).toBe(true);
    expect(hasStaticImport(appContent, './GameCatalog')).toBe(true);
  });

  it('wraps the lazy routes in a single suspense boundary', () => {
    const appContent = read('src/components/AppContent.tsx');
    expect(appContent).toContain('Suspense');
    expect(appContent).toContain('RouteFallback');
  });
});
