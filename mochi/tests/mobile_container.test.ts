import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import config from '../capacitor.config';

describe('Mobile Container Configuration and Scaffolding', () => {
  const mochiRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(mochiRoot, '..');

  it('validates capacitor.config.ts fields', () => {
    expect(config.appId).toBe('com.mochi.game');
    expect(config.appName).toBe('Mochi');
    expect(config.webDir).toBe('dist');
    expect(config.server?.iosScheme).toBe('capacitor');
    expect(config.server?.androidScheme).toBe('https');
    expect(config.server?.cleartext).toBe(false);
    expect(config.server?.allowNavigation).toContain('game.lenout.com');
    expect(config.server?.allowNavigation).toContain('api-game.lenout.com');
  });

  it('validates mobile viewport configuration in index.html', () => {
    const htmlPath = path.join(mochiRoot, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('viewport-fit=cover');
    expect(htmlContent).toContain('user-scalable=no');
    expect(htmlContent).toContain('maximum-scale=1.0');
  });

  it('validates mobile overscroll and touch callout in index.css', () => {
    const cssPath = path.join(mochiRoot, 'src', 'index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('overscroll-behavior: none;');
    expect(cssContent).toContain('-webkit-touch-callout: none;');
  });

  it('validates mobile package scripts in mochi and root package.json', () => {
    const mochiPkg = JSON.parse(
      fs.readFileSync(path.join(mochiRoot, 'package.json'), 'utf8')
    );
    expect(mochiPkg.scripts['cap:sync']).toBe('cap sync');
    expect(mochiPkg.scripts['build:mobile:ios']).toBe(
      'npm run build && cap sync ios'
    );
    expect(mochiPkg.scripts['build:mobile:android']).toBe(
      'npm run build && cap sync android'
    );
    expect(mochiPkg.dependencies['@capacitor/core']).toBeDefined();
    expect(mochiPkg.devDependencies['@capacitor/cli']).toBeDefined();

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    );
    expect(rootPkg.scripts['mobile:sync']).toBe(
      'npm run cap:sync --workspace=mochi'
    );
    expect(rootPkg.scripts['mobile:build:ios']).toBe(
      'npm run build:mobile:ios --workspace=mochi'
    );
    expect(rootPkg.scripts['mobile:build:android']).toBe(
      'npm run build:mobile:android --workspace=mochi'
    );
  });

  it('validates mobile allowed origins in cors.ts', () => {
    const corsPath = path.join(
      projectRoot,
      'mochi-cloud',
      'src',
      'middleware',
      'cors.ts'
    );
    const corsContent = fs.readFileSync(corsPath, 'utf8');
    expect(corsContent).toContain('capacitor://localhost');
    expect(corsContent).toContain('https://localhost');
  });
});
