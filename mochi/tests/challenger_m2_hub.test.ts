// Adversarial Challenger Empirical Test Suite: Milestone 2 Studio Hub
// Rigorous verification of Hub rendering, search edge cases, debounce, auth & errors.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { I18nProvider } from '../src/i18n/context';
import { renderToString } from 'react-dom/server';

const renderWithI18n = (element: React.ReactElement): string =>
  renderToString(React.createElement(I18nProvider, { initialLocale: 'en' }, element));
import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_TEMPLATES } from '../src/components/studio/templates/studioTemplates';
import { StudioHub } from '../src/components/studio/StudioHub';
import { StudioHubTemplates } from '../src/components/studio/StudioHubTemplates';
import { StudioHubRecentList } from '../src/components/studio/StudioHubRecentList';

let mockAuth = { user: null as any, token: null as string | null };

vi.mock('../src/store/useAuthStore', () => ({
  useAuthStore: (selector?: (state: any) => any) => {
    const state = {
      user: mockAuth.user,
      token: mockAuth.token,
      isInitialized: true,
      isLoading: false,
      error: null
    };
    return typeof selector === 'function' ? selector(state) : state;
  }
}));

describe('Milestone 2 Challenger: Studio Hub Landing View & Edge States', () => {
  const rootDir = path.resolve(__dirname, '..');
  const HUB_FILES = [
    'src/components/studio/StudioHub.tsx',
    'src/components/studio/StudioHubTemplates.tsx',
    'src/components/studio/StudioHubRecentList.tsx'
  ];

  describe('Search & Filter Robustness', () => {
    it('returns all templates when searchQuery is empty, whitespace, or undefined', () => {
      const renderQ = (q?: string) =>
        renderWithI18n(
          React.createElement(StudioHubTemplates, {
            templates: STUDIO_TEMPLATES,
            onUseTemplate: () => {},
            searchQuery: q
          })
        );
      ['', '   ', undefined].forEach((q) => {
        const html = renderQ(q);
        expect(html).toContain('data-testid="template-card-baseplate"');
        expect(html).toContain('data-testid="template-card-flat_terrain"');
        expect(html).toContain('data-testid="template-card-obby"');
      });
    });

    it('renders zero-matches-guidance when search query has no match', () => {
      const html = renderWithI18n(
        React.createElement(StudioHubTemplates, {
          templates: STUDIO_TEMPLATES,
          onUseTemplate: () => {},
          searchQuery: 'completely_unmatched_query_xyz_123'
        })
      );
      expect(html).toContain('data-testid="zero-matches-guidance"');
      expect(html).not.toContain('data-testid="template-card-baseplate"');
    });

    it('handles special regex characters safely without throwing SyntaxError', () => {
      const specials = ['[', ']', '\\', '(', ')', '.*', '+', '?', '^', '$', '{', '}', '|'];
      specials.forEach((q) => {
        expect(() => {
          renderWithI18n(
            React.createElement(StudioHubTemplates, {
              templates: STUDIO_TEMPLATES,
              onUseTemplate: () => {},
              searchQuery: q
            })
          );
        }).not.toThrow();
      });
    });

    it('performs case-insensitive substring search matching name, description, and previewType', () => {
      const renderQ = (q: string) =>
        renderWithI18n(
          React.createElement(StudioHubTemplates, {
            templates: STUDIO_TEMPLATES,
            onUseTemplate: () => {},
            searchQuery: q
          })
        );
      expect(renderQ('BASEPLATE')).toContain('data-testid="template-card-baseplate"');
      expect(renderQ('terrain')).toContain('data-testid="template-card-flat_terrain"');
      expect(renderQ('lava')).toContain('data-testid="template-card-obby"');
    });
  });

  describe('Hub Interaction Edge States', () => {
    it('disables template action button when isCreating is true', () => {
      const html = renderWithI18n(
        React.createElement(StudioHubTemplates, {
          templates: STUDIO_TEMPLATES,
          onUseTemplate: () => {},
          isCreating: true
        })
      );
      expect(html).toContain('disabled=""');
    });

    it('renders empty drafts state with Create First Experience button when drafts list is empty', () => {
      const html = renderWithI18n(
        React.createElement(StudioHubRecentList, {
          drafts: [],
          isLoading: false,
          error: null,
          onEditDraft: () => {},
          onCreateNew: () => {}
        })
      );
      expect(html).toContain('data-testid="drafts-empty-state"');
      expect(html).toContain('No saved experiences yet');
      expect(html).toContain('data-testid="create-first-experience-btn"');
    });

    it('renders drafts grid with title, autosave badge, and formatted timestamps for populated list', () => {
      const mockDrafts = [
        {
          id: 'map_draft_001',
          userId: 'user_1',
          title: 'Speed Run Obby',
          description: 'A 20-stage challenge',
          isAutosave: true,
          versionNumber: '1.2.0',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-09T08:30:00Z'
        },
        {
          id: 'map_draft_002',
          userId: 'user_1',
          title: '', // Fallback to Untitled Experience
          createdAt: '2026-11-08T12:00:00Z'
        }
      ];

      const html = renderWithI18n(
        React.createElement(StudioHubRecentList, {
          drafts: mockDrafts,
          isLoading: false,
          error: null,
          onEditDraft: () => {}
        })
      );
      expect(html).toContain('data-testid="drafts-grid"');
      expect(html).toContain('Speed Run Obby');
      expect(html).toContain('Untitled Experience');
      expect(html).toContain('Autosave');
      expect(html).toMatch(/v(<!-- -->)?1\.2\.0/);
    });

    it('handles malformed date strings in formatUpdatedTime without crashing', () => {
      const mockDrafts = [{ id: 'map_bad_date', userId: 'u1', title: 'Bad Date', createdAt: 'not-a-date' }];
      expect(() => {
        const html = renderWithI18n(
          React.createElement(StudioHubRecentList, {
            drafts: mockDrafts,
            isLoading: false,
            error: null,
            onEditDraft: () => {}
          })
        );
        expect(html).toContain('not-a-date');
      }).not.toThrow();
    });

    it('renders error state with retry trigger when drafts error is present', () => {
      const html = renderWithI18n(
        React.createElement(StudioHubRecentList, {
          drafts: [],
          isLoading: false,
          error: 'Connection timeout to drafts database',
          onEditDraft: () => {},
          onRetry: () => {}
        })
      );
      expect(html).toContain('data-testid="drafts-error-state"');
      expect(html).toContain('Failed to load recent experiences');
      expect(html).toContain('data-testid="drafts-retry-btn"');
    });

    it('renders loading skeleton when isLoading is true and error is null', () => {
      const html = renderWithI18n(
        React.createElement(StudioHubRecentList, {
          drafts: [],
          isLoading: true,
          error: null,
          onEditDraft: () => {}
        })
      );
      expect(html).toContain('data-testid="drafts-loading-state"');
      expect(html).toContain('animate-pulse');
    });
  });

  describe('StudioHub Full View & Authentication Flow', () => {
    it('renders StudioHub for unauthenticated visitor without refresh button or crash', () => {
      mockAuth = { user: null, token: null };
      const html = renderWithI18n(React.createElement(StudioHub));
      expect(html).toContain('data-testid="studio-hub-landing"');
      expect(html).toContain('Mochi Studio');
      expect(html).toContain('Experience Hub');
      expect(html).toContain('data-testid="template-search-input"');
      expect(html).toContain('data-testid="new-blank-project-btn"');
      expect(html).not.toContain('data-testid="refresh-drafts-btn"');
    });

    it('renders StudioHub with refresh button when user is authenticated with token', () => {
      mockAuth = { user: { id: 'u_auth', username: 'hero' } as any, token: 'mock_jwt_token' };
      const html = renderWithI18n(React.createElement(StudioHub));
      expect(html).toContain('data-testid="refresh-drafts-btn"');
      mockAuth = { user: null, token: null };
    });

    it('verifies StudioHub does not mount WebGL 3D Canvas context', () => {
      const hubSource = fs.readFileSync(path.join(rootDir, 'src/components/studio/StudioHub.tsx'), 'utf8');
      expect(hubSource).not.toContain('<canvas');
      expect(hubSource).not.toContain('Studio3DCanvas');
      expect(hubSource).not.toContain('WebGLRenderer');
    });

    it('verifies StudioHub uses semantic studio dark design tokens', () => {
      const hubSource = fs.readFileSync(path.join(rootDir, 'src/components/studio/StudioHub.tsx'), 'utf8');
      expect(hubSource).toContain('bg-studio-bg');
      expect(hubSource).toContain('bg-studio-ribbon');
      expect(hubSource).toContain('bg-studio-panel');
      expect(hubSource).toContain('border-studio-border');
      expect(hubSource).toContain('text-studio-text');
      expect(hubSource).toContain('text-studio-muted');
    });
  });

  describe('Static Invariants (SRP <= 300 LOC, Zero Emojis, Zero Legacy Strings)', () => {
    const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const LEGACY_BRAND_REGEX = /roblox|rbx/i;

    HUB_FILES.forEach((relPath) => {
      it(`enforces invariants on ${relPath}`, () => {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        expect(lines.length).toBeLessThanOrEqual(300);

        lines.forEach((line, idx) => {
          expect(EMOJI_REGEX.test(line), `Emoji at ${relPath}:${idx + 1}`).toBe(false);
          expect(LEGACY_BRAND_REGEX.test(line), `Legacy brand at ${relPath}:${idx + 1}`).toBe(false);
        });
      });
    });
  });
});
