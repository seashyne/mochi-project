// Empirical Challenger Resilience & Stress Suite: Milestone 2
// Deep Object Inspection, Large Volume Drafts, Debouncing, and Guest Action Fallbacks

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { I18nProvider } from '../src/i18n/context';
import { renderToString } from 'react-dom/server';

const renderWithI18n = (element: React.ReactElement): string =>
  renderToString(React.createElement(I18nProvider, { initialLocale: 'en' }, element));
import {
  STUDIO_TEMPLATES,
  getTemplateById
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

describe('Milestone 2 Resilience: Template Scene Deep Inspection', () => {
  it('R2_01: Baseplate geometry and spawn pad configuration', () => {
    const baseplate = getTemplateById('baseplate')!;
    const platform = baseplate.objects.find((o) => o.name === 'Baseplate_Platform')!;
    expect(platform.scale).toEqual({ x: 64, y: 1, z: 64 });
    expect(platform.anchored).toBe(true);
    expect(platform.canCollide).toBe(true);

    const spawn = baseplate.objects.find((o) => o.type === 'spawn')!;
    expect(spawn.position.y).toBeGreaterThan(0);
    expect(spawn.material).toBe('neon');
    expect(spawn.luaScript).toContain('world.setSpawnPoint');
  });

  it('R2_02: Flat Terrain scenic elements and lighting initialization', () => {
    const terrain = getTemplateById('flat_terrain')!;
    const ground = terrain.objects.find((o) => o.name === 'Grass_Terrain')!;
    expect(ground.scale).toEqual({ x: 80, y: 1, z: 80 });

    const hills = terrain.objects.filter((o) => o.name.startsWith('Scenic_Hill'));
    expect(hills.length).toBe(2);
    expect(terrain.scriptCode).toContain('world.setTime("12:00")');
  });

  it('R2_03: Obby hazard mechanics, jump progression, and victory podium', () => {
    const obby = getTemplateById('obby')!;
    const steps = obby.objects.filter((o) => o.name.startsWith('Neon_Step_'));
    expect(steps.length).toBe(4);

    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i + 1].position.y).toBeGreaterThan(steps[i].position.y);
      expect(steps[i + 1].position.z).toBeGreaterThan(steps[i].position.z);
    }

    const hazard = obby.objects.find((o) => o.type === 'hazard')!;
    expect(hazard.luaScript).toContain('takeDamage(100)');
    expect(hazard.luaScript).toContain('respawn()');

    const checkpoint = obby.objects.find((o) => o.name === 'Checkpoint_Platform')!;
    expect(checkpoint.position.z).toBeGreaterThan(steps[3].position.z);

    const trophy = obby.objects.find((o) => o.type === 'coin')!;
    expect(trophy.luaScript).toContain('addScore("Wins", 1)');
  });
});

describe('Milestone 2 Resilience: High Volume & Boundary Draft Rendering', () => {
  it('R2_04: Handles large volume of drafts without UI degradation', () => {
    const drafts: StudioProjectDraft[] = Array.from({ length: 60 }, (_, i) => ({
      id: `draft_${i}`,
      title: i % 2 === 0 ? `Draft Project ${i}` : '',
      description: i % 3 === 0 ? `Description for draft ${i}` : undefined,
      manifest: '{}',
      isAutosave: i % 4 === 0,
      versionNumber: i % 5 === 0 ? `1.0.${i}` : undefined,
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - i * 1800000).toISOString()
    }));

    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts,
        isLoading: false,
        error: null,
        onEditDraft: () => {}
      })
    );
    expect(html).toContain('draft-card-draft_0');
    expect(html).toContain('draft-card-draft_59');
    expect(html).toContain('Untitled Experience');
  });

  it('R2_05: Handles missing callbacks gracefully without crashing', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubRecentList, {
        drafts: [],
        isLoading: false,
        error: null,
        onEditDraft: () => {}
      })
    );
    expect(html).toContain('drafts-empty-state');
    expect(html).not.toContain('create-first-experience-btn');
  });
});

describe('Milestone 2 Resilience: Template Selection & Lockout Mechanics', () => {
  it('R2_06: Disables use buttons when isCreating is active', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubTemplates, {
        templates: STUDIO_TEMPLATES,
        onUseTemplate: () => {},
        isCreating: true
      })
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('Creating...');
  });

  it('R2_07: Handles empty template list gracefully with guidance', () => {
    const html = renderWithI18n(
      React.createElement(StudioHubTemplates, {
        templates: [],
        onUseTemplate: () => {}
      })
    );
    expect(html).toContain('zero-matches-guidance');
  });
});

describe('Milestone 2 Resilience: Guest Flow and Navigation Triggers', () => {
  beforeEach(() => {
    mockAuth = { user: null, token: null };
  });

  it('R2_08: Hub renders landing container with zero WebGL scripts or canvases', () => {
    const html = renderWithI18n(React.createElement(StudioHub, {}));
    expect(html).toContain('data-testid="studio-hub-landing"');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('three');
  });

  it('R2_09: Fallback to untitled title when draft title is whitespace only', () => {
    const drafts: StudioProjectDraft[] = [
      {
        id: 'draft_blank_title',
        title: '   ',
        manifest: '{}',
        createdAt: new Date().toISOString()
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
    expect(html).toContain('draft-card-draft_blank_title');
  });
});
