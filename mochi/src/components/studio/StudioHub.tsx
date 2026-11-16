// Mochi Studio Experience Hub Landing View
// Template chooser, recent drafts list, and new project creation triggers

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { studioDraftsApi, StudioProjectDraft } from '../../api/studioDrafts';
import { studioTeamApi } from '../../api/studioTeam';
import { generateMapId } from '../../routes/studioRouting';
import { STUDIO_TEMPLATES, StudioTemplateDefinition } from './templates/studioTemplates';
import { StudioHubTemplates } from './StudioHubTemplates';
import { StudioHubRecentList } from './StudioHubRecentList';
import { createStarterObjects } from './studioDefaults';
import { STARTER_ENVIRONMENT } from '../../engine/environment/environmentTypes';

export interface StudioHubProps {
  onOpenMap?: (mapId: string) => void;
  onCreateFromTemplate?: (template: StudioTemplateDefinition) => void;
  onCreateBlank?: () => void;
  onRequireAuth?: () => void;
  onBackToPortal?: () => void;
}

export const StudioHub: React.FC<StudioHubProps> = ({
  onOpenMap,
  onCreateFromTemplate,
  onCreateBlank,
  onRequireAuth,
  onBackToPortal
}) => {
  const { user, token } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState<StudioProjectDraft[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!token) { setDrafts([]); setIsLoadingDrafts(false); setDraftsError(null); return; }
    setIsLoadingDrafts(true); setDraftsError(null);
    try {
      const [owned, shared] = await Promise.all([
        studioDraftsApi.listMine(token),
        studioTeamApi.listShared(token).catch(() => ({ drafts: [], total: 0 }))
      ]);
      const own = (owned.drafts || []).map((draft) => ({ ...draft, accessRole: 'owner' as const }));
      setDrafts([...own, ...(shared.drafts || [])]);
    } catch (err) {
      setDraftsError(err instanceof Error ? err.message : 'Failed to retrieve drafts');
    } finally {
      setIsLoadingDrafts(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  const handleCreateBlank = useCallback(async () => {
    if (!token && !user) {
      if (onRequireAuth) {
        onRequireAuth();
        return;
      }
    }

    if (onCreateBlank) {
      onCreateBlank();
      return;
    }

    setIsCreating(true);
    try {
      const mapId = generateMapId();
      if (token) {
        await studioDraftsApi.save(
          {
            id: mapId,
            title: 'New Experience',
            // A new project opens on the starter baseplate with the full service
            // tree (Workspace, Lighting, Sky, Atmosphere) already configured.
            objects: createStarterObjects(),
            environment: STARTER_ENVIRONMENT,
            scriptCode: '-- New Blank Experience\nprint("Welcome to Mochi Studio")'
          },
          token
        );
      }
      if (onOpenMap) {
        onOpenMap(mapId);
      }
    } catch (err) {
      console.error('Failed to create blank project:', err);
    } finally {
      setIsCreating(false);
    }
  }, [token, user, onRequireAuth, onCreateBlank, onOpenMap]);

  const handleUseTemplate = useCallback(
    async (template: StudioTemplateDefinition) => {
      if (!token && !user) {
        if (onRequireAuth) {
          onRequireAuth();
          return;
        }
      }

      if (onCreateFromTemplate) {
        onCreateFromTemplate(template);
        return;
      }

      setIsCreating(true);
      try {
        const mapId = generateMapId();
        if (token) {
          await studioDraftsApi.save(
            {
              id: mapId,
              title: template.name,
              description: template.description,
              objects: template.objects,
              scriptCode: template.scriptCode
            },
            token
          );
        }
        if (onOpenMap) {
          onOpenMap(mapId);
        }
      } catch (err) {
        console.error('Failed to instantiate template draft:', err);
      } finally {
        setIsCreating(false);
      }
    },
    [token, user, onRequireAuth, onCreateFromTemplate, onOpenMap]
  );

  return (
    <div
      data-testid="studio-hub-landing"
      className="min-h-screen bg-studio-bg text-studio-text flex flex-col font-sans"
    >
      {/* Top Banner & Header Bar */}
      <header className="bg-studio-ribbon border-b border-studio-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBackToPortal && (
              <button
                type="button"
                onClick={onBackToPortal}
                title="Back to Mochi website"
                className="px-2.5 py-1.5 rounded-lg bg-studio-panel hover:bg-studio-card border border-studio-border text-studio-muted hover:text-studio-text transition-colors flex items-center gap-1.5 text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Website</span>
              </button>
            )}
            <div className="w-9 h-9 rounded-lg bg-studio-accent/10 border border-studio-accent/30 flex items-center justify-center text-studio-accent">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-studio-text tracking-tight">
                  Mochi Studio
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-studio-panel border border-studio-border text-studio-accent">
                  Experience Hub
                </span>
              </div>
              <p className="text-xs text-studio-muted">
                Create, build, and publish 3D multiplayer worlds
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input for Templates */}
            <div className="relative">
              <input
                type="text"
                data-testid="template-search-input"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-44 sm:w-56 px-3 py-1.5 ps-8 text-xs rounded-lg bg-studio-panel border border-studio-border text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-colors"
              />
              <svg
                className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-studio-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* New Blank Project Trigger */}
            <button
              type="button"
              data-testid="new-blank-project-btn"
              disabled={isCreating}
              onClick={handleCreateBlank}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-studio-accent hover:bg-studio-accent/90 text-studio-on-accent flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-studio-accent/40"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{isCreating ? 'Creating...' : 'New Blank Project'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Sections */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* Templates Chooser Section */}
        <section data-testid="template-chooser-section">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-studio-text">
                Start with a Template
              </h2>
              <p className="text-xs text-studio-muted mt-0.5">
                Jumpstart your creation with pre-configured mechanics and environments
              </p>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-studio-muted hover:text-studio-text transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
          <StudioHubTemplates
            templates={STUDIO_TEMPLATES}
            onUseTemplate={handleUseTemplate}
            searchQuery={searchQuery}
            isCreating={isCreating}
          />
        </section>

        {/* Recent Experiences / Drafts Section */}
        <section data-testid="recent-drafts-section">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-studio-text">
                Recent Experiences
              </h2>
              <p className="text-xs text-studio-muted mt-0.5">
                Continue editing your saved maps and cloud drafts
              </p>
            </div>
            {token && (
              <button
                type="button"
                data-testid="refresh-drafts-btn"
                onClick={fetchDrafts}
                disabled={isLoadingDrafts}
                className="text-xs text-studio-muted hover:text-studio-text px-2 py-1 rounded bg-studio-panel border border-studio-border hover:border-studio-muted transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
            )}
          </div>
          <StudioHubRecentList
            drafts={drafts}
            isLoading={isLoadingDrafts}
            error={draftsError}
            onEditDraft={(id) => onOpenMap?.(id)}
            onRetry={fetchDrafts}
            onCreateNew={handleCreateBlank}
          />
        </section>
      </main>
    </div>
  );
};
