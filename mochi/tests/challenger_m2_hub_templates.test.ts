// Empirical Challenger Adversarial Test Suite: Milestone 2
// Studio Templates, Experience Hub Landing, Drafts Resilience, and WebGL Absence

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { I18nProvider } from '../src/i18n/context';
import { renderToString } from 'react-dom/server';

const renderWithI18n = (element: React.ReactElement): string =>
  renderToString(React.createElement(I18nProvider, { initialLocale: 'en' }, element));
import {
  STUDIO_TEMPLATES,
  getTemplateById,
  validateTemplateManifestBytes,
  MAX_MANIFEST_BYTES,
  StudioTemplateDefinition
} from '../src/components/studio/templates/studioTemplates';
import { StudioHubTemplates } from '../src/components/studio/StudioHubTemplates';
import { StudioHubRecentList } from '../src/components/studio/StudioHubRecentList';
import { StudioHub } from '../src/components/studio/StudioHub';
import { StudioProjectDraft } from '../src/api/studioDrafts';

let mockAuth = { user: null as any, token: null as string | null };

vi.mock('../src/store/useAuthStore', () => ({
  useAuthStore: () => ({
    user: mockAuth.user,
    token: mockAuth.token,
    isInitialized: true,
    isLoading: false,
    error: null
  })
}));

describe('Milestone 2 Adversarial Challenge: studioTemplates.ts', () => {
  it('C2_01: Validates template registry completeness and object counts', () => {
    expect(STUDIO_TEMPLATES).toHaveLength(3);
    const ids = STUDIO_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(['baseplate', 'flat_terrain', 'obby']);

    const baseplate = getTemplateById('baseplate')!;
    expect(baseplate.objects.length).toBe(2);
    expect(baseplate.grid).toBe(64);
    expect(baseplate.hasSpawn).toBe(true);

    const flatTerrain = getTemplateById('flat_terrain')!;
    expect(flatTerrain.objects.length).toBe(5);
    expect(flatTerrain.grid).toBe(80);
    expect(flatTerrain.hasSpawn).toBe(true);

    const obby = getTemplateById('obby')!;
    expect(obby.objects.length).toBe(10);
    expect(obby.hasSpawn).toBe(true);
    expect(obby.hasHazard).toBe(true);
    expect(obby.hasGoal).toBe(true);
  });

  it('C2_02: Enforces finite numbers for all 3D coordinates and non-zero scales', () => {
    for (const tpl of STUDIO_TEMPLATES) {
      for (const obj of tpl.objects) {
        expect(Number.isFinite(obj.position.x)).toBe(true);
        expect(Number.isFinite(obj.position.y)).toBe(true);
        expect(Number.isFinite(obj.position.z)).toBe(true);
        expect(Number.isFinite(obj.scale.x)).toBe(true);
        expect(Number.isFinite(obj.scale.y)).toBe(true);
        expect(Number.isFinite(obj.scale.z)).toBe(true);
        expect(obj.scale.x).toBeGreaterThan(0);
        expect(obj.scale.y).toBeGreaterThan(0);
        expect(obj.scale.z).toBeGreaterThan(0);
      }
    }
  });

  it('C2_03: Guarantees globally unique object identifiers across all templates', () => {
    const allObjectIds = STUDIO_TEMPLATES.flatMap((t) => t.objects.map((o) => o.id));
    const uniqueIds = new Set(allObjectIds);
    expect(uniqueIds.size).toBe(allObjectIds.length);
  });

  it('C2_04: Validates essential script tokens in starter scene templates', () => {
    const baseplate = getTemplateById('baseplate')!;
    expect(baseplate.scriptCode).toContain('print("Baseplate")');

    const terrain = getTemplateById('flat_terrain')!;
    expect(terrain.scriptCode).toContain('world.setTime("12:00")');

    const obby = getTemplateById('obby')!;
    expect(obby.scriptCode).toContain('takeDamage(100)');
    const hazardObj = obby.objects.find((o) => o.type === 'hazard')!;
    expect(hazardObj.luaScript).toContain('player.takeDamage(100)');
  });

  it('C2_05: Validates 64KB manifest byte boundaries', () => {
    expect(MAX_MANIFEST_BYTES).toBe(65536);
    for (const tpl of STUDIO_TEMPLATES) {
      expect(validateTemplateManifestBytes(tpl)).toBe(true);
    }

    const bloatedTemplate: StudioTemplateDefinition = {
      ...STUDIO_TEMPLATES[0],
      scriptCode: 'x'.repeat(65500)
    };
    expect(validateTemplateManifestBytes(bloatedTemplate)).toBe(false);
  });

  it('C2_06: getTemplateById handles non-existent and malformed queries safely', () => {
    expect(getTemplateById('unknown')).toBeUndefined();
    expect(getTemplateById('')).toBeUndefined();
    expect(getTemplateById('BASEPLATE')).toBeUndefined();
  });
});

describe('Milestone 2 Adversarial Challenge: StudioHubTemplates.tsx', () => {
  it('C2_07: Renders template chooser cards without canvas elements', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubTemplates, {
        templates: STUDIO_TEMPLATES,
        onUseTemplate: () => {}
      })
    );
    expect(html).toContain('template-chooser-grid');
    expect(html).toContain('template-card-baseplate');
    expect(html).toContain('template-card-flat_terrain');
    expect(html).toContain('template-card-obby');
    expect(html).not.toContain('<canvas');
  });

  it('C2_08: Search query filter matches name, description, and type case-insensitively', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubTemplates, {
        templates: STUDIO_TEMPLATES,
        onUseTemplate: () => {},
        searchQuery: '  OBBY  '
      })
    );
    expect(html).toContain('template-card-obby');
    expect(html).not.toContain('template-card-baseplate');
    expect(html).not.toContain('template-card-flat_terrain');
  });

  it('C2_09: Search with special regex symbols does not throw SyntaxError', () => {
    expect(() => {
      renderWithI18n(
        React.createElement(StudioHubTemplates, {
          templates: STUDIO_TEMPLATES,
          onUseTemplate: () => {},
          searchQuery: '[.*+?^${}()|/\\'
        })
      );
    }).not.toThrow();
  });

  it('C2_10: Displays zero-matches guidance on unmatched search query', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubTemplates, {
        templates: STUDIO_TEMPLATES,
        onUseTemplate: () => {},
        searchQuery: 'completely_unmatched_term_99'
      })
    );
    expect(html).toContain('zero-matches-guidance');
    expect(html).not.toContain('template-card-');
  });
});

describe('Milestone 2 Adversarial Challenge: StudioHubRecentList.tsx', () => {
  it('C2_11: Renders clean empty state with CTA button when drafts list is empty', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts: [],
        isLoading: false,
        error: null,
        onEditDraft: () => {},
        onCreateNew: () => {}
      })
    );
    expect(html).toContain('drafts-empty-state');
    expect(html).toContain('create-first-experience-btn');
    expect(html).toContain('No saved experiences yet');
  });

  it('C2_12: Renders error state with retry button on draft fetch failure', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts: [],
        isLoading: false,
        error: 'Failed to connect to cloud service',
        onEditDraft: () => {},
        onRetry: () => {}
      })
    );
    expect(html).toContain('drafts-error-state');
    expect(html).toContain('drafts-retry-btn');
    expect(html).toContain('Failed to connect to cloud service');
  });

  it('C2_13: Renders animated skeleton placeholder cards when loading', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts: [],
        isLoading: true,
        error: null,
        onEditDraft: () => {}
      })
    );
    expect(html).toContain('drafts-loading-state');
    expect(html).toContain('animate-pulse');
  });

  it('C2_14: Safely formats malformed date strings without throwing', () => {
    const drafts: StudioProjectDraft[] = [
      {
        id: 'draft_corrupt_date',
        title: 'Corrupt Date Draft',
        description: 'Test description',
        manifest: '{}',
        isAutosave: true,
        versionNumber: '1.0.0',
        createdAt: 'invalid-date-string-abc',
        updatedAt: 'invalid-date-string-xyz'
      }
    ];
    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts,
        isLoading: false,
        error: null,
        onEditDraft: () => {}
      })
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');
    expect(cleanHtml).toContain('draft-card-draft_corrupt_date');
    expect(cleanHtml).toContain('Corrupt Date Draft');
    expect(cleanHtml).toContain('Autosave');
    expect(cleanHtml).toContain('v1.0.0');
    expect(cleanHtml).toContain('invalid-date-string-xyz');
  });
});

describe('Milestone 2 Adversarial Challenge: StudioHub.tsx Landing View', () => {
  beforeEach(() => {
    mockAuth = { user: null, token: null };
  });

  it('C2_15: Guarantees zero WebGL canvas instances rendered in StudioHub landing', () => {
    const html = renderWithI18n(React.createElement(StudioHub, {}));
    expect(html).toContain('studio-hub-landing');
    expect(html).toContain('template-chooser-section');
    expect(html).toContain('recent-drafts-section');
    expect(html).toContain('template-search-input');
    expect(html).toContain('new-blank-project-btn');
    expect(html).not.toContain('<canvas');
  });

  it('C2_16: Uses semantic eye-friendly dark design tokens in hub structure', () => {
    const html = renderWithI18n(React.createElement(StudioHub, {}));
    expect(html).toContain('bg-studio-bg');
    expect(html).toContain('text-studio-text');
    expect(html).toContain('bg-studio-ribbon');
    expect(html).toContain('border-studio-border');
  });

  it('C2_17: Authenticated user sees refresh drafts button', () => {
    mockAuth = { user: { id: 'u_1', username: 'TestCreator' }, token: 'mock_jwt_token' };
    const html = renderWithI18n(React.createElement(StudioHub, {}));
    expect(html).toContain('refresh-drafts-btn');
  });

  it('C2_18: Unauthenticated guest does not see refresh button but can browse templates', () => {
    mockAuth = { user: null, token: null };
    const html = renderWithI18n(React.createElement(StudioHub, {}));
    expect(html).not.toContain('refresh-drafts-btn');
    expect(html).toContain('template-chooser-section');
    expect(html).toContain('template-card-baseplate');
  });
});
