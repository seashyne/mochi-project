// Adversarial Challenger Empirical Test Suite: Milestone 3 Map ID Routing & State Isolation
// Rigorous verification of route parsing, zero WebGL on Hub, and complete cross-map isolation

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { I18nProvider } from '../src/i18n/context';
import { renderToString } from 'react-dom/server';

const renderWithI18n = (element: React.ReactElement): string =>
  renderToString(React.createElement(I18nProvider, { initialLocale: 'en' }, element));
import {
  parseStudioRoute,
  parsePlayRoute,
  resolveStudioPath,
  resolvePlayPath,
  sanitizeMapId,
  isValidMapId,
  isStudioPathname,
  isPlayPathname,
  buildMapGameSummary
} from '../src/routes/studioRouting';
import { StudioHub } from '../src/components/studio/StudioHub';
import { StudioScene } from '../src/engine/studio/studioScene';

// Mock WebGLRenderer for headless testing environment
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas?: HTMLCanvasElement } = {}) {
      this.domElement = canvas || ({} as HTMLCanvasElement);
    }
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

function createMockCanvas(): HTMLCanvasElement {
  return {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  } as unknown as HTMLCanvasElement;
}

describe('Challenger M3: Adversarial Route Parsing & Sanitization', () => {
  it('rejects sophisticated path traversal and directory escape attempts', () => {
    const maliciousMapIds = [
      '..', '../', '../../', '..\\..\\windows\\system32', '....',
      '/etc/passwd', '..%2f..%2fadmin', 'map/../../escape', '.', './local', '~user', '|calc.exe', ';rm -rf /'
    ];
    maliciousMapIds.forEach((id) => {
      expect(sanitizeMapId(id)).toBeNull();
      expect(isValidMapId(id)).toBe(false);
    });

    const maliciousUrls = [
      '/studio/..', '/studio/../admin', '/studio/....', '/studio/..%2fadmin',
      '/studio/%2e%2e', '/studio/.', '/studio/~user', '/studio/|calc'
    ];
    maliciousUrls.forEach((url) => {
      expect(parseStudioRoute(url).mapId).toBeNull();
    });
  });

  it('rejects XSS, HTML tags, URI-encoded tokens, and shell metacharacters', () => {
    const attackPayloads = [
      '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:void(0)',
      'map%20with%20spaces', 'map$var', 'map`id`', 'map{id}', 'map[id]', 'map@domain'
    ];
    attackPayloads.forEach((payload) => {
      expect(sanitizeMapId(payload)).toBeNull();
      expect(isValidMapId(payload)).toBe(false);
      expect(parseStudioRoute(`/studio/${payload}`).mapId).toBeNull();
    });
  });

  it('handles query parameter vs path parameter precedence correctly', () => {
    expect(parseStudioRoute('/studio/map-path-1', '?mapId=map-query-2').mapId).toBe('map-path-1');
    expect(parseStudioRoute('/studio', '?mapId=map-query-2').mapId).toBe('map-query-2');
    expect(parseStudioRoute('/studio', '?projectId=proj-query-3').mapId).toBe('proj-query-3');
    expect(parseStudioRoute('/studio', '?mapId=../malicious').mapId).toBeNull();
  });

  it('verifies both /play/:mapId and /game/:mapId aliases with deep subpaths', () => {
    expect(parsePlayRoute('/play/stage_100').mapId).toBe('stage_100');
    expect(parsePlayRoute('/game/stage_100').mapId).toBe('stage_100');
    expect(parsePlayRoute('/play/stage_100/nested/sub').mapId).toBe('stage_100');
    expect(parsePlayRoute('/game/stage_100/extra').mapId).toBe('stage_100');
    expect(parsePlayRoute('/play').mapId).toBeNull();
    expect(parsePlayRoute('/game').mapId).toBeNull();
    expect(parsePlayRoute('/other/stage_100').isPlay).toBe(false);
  });

  it('canonicalizes paths via resolveStudioPath and resolvePlayPath with sanitization', () => {
    expect(resolveStudioPath('valid_map-123')).toBe('/studio/valid_map-123');
    expect(resolveStudioPath('../invalid')).toBe('/studio');
    expect(resolveStudioPath(null)).toBe('/studio');
    expect(resolveStudioPath(undefined)).toBe('/studio');
    expect(resolveStudioPath('')).toBe('/studio');

    expect(resolvePlayPath('valid_map-123')).toBe('/play/valid_map-123');
    expect(resolvePlayPath('../invalid')).toBe('/play');
  });
});

describe('Challenger M3: StudioHub Zero-WebGL Canvas Empirical Verification', () => {
  it('confirms StudioHub renders HTML markup with ZERO canvas elements', () => {
    const html = renderWithI18n(
      React.createElement(StudioHub, { onOpenMap: () => {}, onRequireAuth: () => {} })
    );

    expect(html).toContain('data-testid="studio-hub-landing"');
    expect(html).toContain('data-testid="template-chooser-section"');
    expect(html).toContain('data-testid="recent-drafts-section"');

    // Empirical check: Absolutely no <canvas> tags rendered on the hub landing view
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('webgl');
    expect(html).not.toContain('three');
  });

  it('confirms SVG graphics are used for templates instead of 3D canvas', () => {
    const html = renderWithI18n(
      React.createElement(StudioHub, { onOpenMap: () => {}, onRequireAuth: () => {} })
    );

    expect(html).toContain('<svg');
    expect(html).toContain('Baseplate');
    expect(html).toContain('Flat Terrain');
    expect(html).toContain('Obby');
  });
});

describe('Challenger M3: Map State Isolation & Scene Lifecycle', () => {
  it('guarantees complete scene disposal on destroy() without memory leaks', () => {
    const scene = new StudioScene();
    scene.init(createMockCanvas());
    scene.addObject({
      id: 'test_block_1', name: 'Block1', type: 'block',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, color: '#00a2ff'
    });

    expect(scene.exportSnapshot('Test Map').objects).toHaveLength(1);
    scene.destroy();
    expect(scene.exportSnapshot('Test Map').objects).toHaveLength(0);
    expect(scene.getSelectedId()).toBeNull();
  });

  it('guarantees state isolation across two independent StudioScene instances', () => {
    const sceneA = new StudioScene();
    const sceneB = new StudioScene();
    sceneA.init(createMockCanvas());
    sceneB.init(createMockCanvas());

    sceneA.addObject({
      id: 'obj_map_a', name: 'MapA_Only', type: 'block',
      position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, color: '#ff0000'
    });

    expect(sceneA.exportSnapshot('Map A').objects).toHaveLength(1);
    expect(sceneB.exportSnapshot('Map B').objects).toHaveLength(0);

    sceneB.addObject({
      id: 'obj_map_b', name: 'MapB_Only', type: 'sphere',
      position: { x: 5, y: 5, z: 5 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 2 }, color: '#00ff00'
    });

    expect(sceneA.exportSnapshot('Map A').objects).toHaveLength(1);
    expect(sceneB.exportSnapshot('Map B').objects).toHaveLength(1);

    sceneA.destroy();
    expect(sceneA.exportSnapshot('Map A').objects).toHaveLength(0);
    expect(sceneB.exportSnapshot('Map B').objects).toHaveLength(1);

    sceneB.destroy();
    expect(sceneB.exportSnapshot('Map B').objects).toHaveLength(0);
  });

  it('verifies synthetic game summary generation for isolated player route', () => {
    const summary = buildMapGameSummary('map-isolated-99', 'user-42');
    expect(summary.id).toBe('map-isolated-99');
    expect(summary.slug).toBe('map-isolated-99');
    expect(summary.title).toBe('Map: map-isolated-99');
    expect(summary.creatorId).toBe('user-42');
    expect(summary.status).toBe('published');
    expect(summary.playCount).toBe(1);
  });
});

describe('Challenger M3: Randomized Fuzzing Harness', () => {
  it('survives 1,000 randomized pseudo-fuzz inputs maintaining strict invariants', () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./\\%?&=#+@!$^&*()[]{}<>';

    for (let i = 0; i < 1000; i++) {
      const length = Math.floor(Math.random() * 40) + 1;
      let randString = '';
      for (let j = 0; j < length; j++) {
        randString += charset[Math.floor(Math.random() * charset.length)];
      }

      // Invariant 1: Pure parsing must NEVER throw an exception
      const studioResult = parseStudioRoute(`/studio/${randString}`);
      const playResult = parsePlayRoute(`/play/${randString}`);
      const rawSanitized = sanitizeMapId(randString);

      // Invariant 2: Any non-null mapId MUST strictly conform to valid identifier pattern
      if (studioResult.mapId !== null) {
        expect(isValidMapId(studioResult.mapId)).toBe(true);
        expect(studioResult.mapId).toMatch(/^[a-zA-Z0-9_-]+$/);
        expect(studioResult.mapId).not.toContain('..');
        expect(studioResult.mapId).not.toContain('/');
        expect(studioResult.mapId).not.toContain('\\');
      }

      if (playResult.mapId !== null) {
        expect(isValidMapId(playResult.mapId)).toBe(true);
        expect(playResult.mapId).toMatch(/^[a-zA-Z0-9_-]+$/);
      }

      if (rawSanitized !== null) {
        expect(isValidMapId(rawSanitized)).toBe(true);
        expect(rawSanitized).toMatch(/^[a-zA-Z0-9_-]+$/);
      }

      // Invariant 3: Resolvers must always generate canonical, safe URIs
      expect(resolveStudioPath(randString).startsWith('/studio')).toBe(true);
      expect(resolvePlayPath(randString).startsWith('/play')).toBe(true);
    }
  });

  it('verifies isStudioPathname and isPlayPathname behavior on boundary prefixes', () => {
    expect(isStudioPathname('/studio')).toBe(true);
    expect(isStudioPathname('/studio/')).toBe(true);
    expect(isStudioPathname('/studio/map-1')).toBe(true);
    expect(isStudioPathname('/studio-app')).toBe(false);
    expect(isStudioPathname('/studiox')).toBe(false);
    expect(isStudioPathname('/STUDIO')).toBe(false);

    expect(isPlayPathname('/play')).toBe(true);
    expect(isPlayPathname('/play/')).toBe(true);
    expect(isPlayPathname('/play/map-1')).toBe(true);
    expect(isPlayPathname('/play-game')).toBe(false);
    expect(isPlayPathname('/game')).toBe(true);
    expect(isPlayPathname('/game/')).toBe(true);
    expect(isPlayPathname('/game/map-1')).toBe(true);
    expect(isPlayPathname('/games')).toBe(false);
  });
});
