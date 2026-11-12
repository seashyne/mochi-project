// Modular Recent Projects & Drafts List Component for Mochi Studio Experience Hub
// Displays saved creator experiences with eye-friendly dark theming and empty/error states

import React from 'react';
import type { StudioProjectDraft } from '../../api/studioDrafts';
import { useI18n } from '../../i18n/context';

export interface StudioHubRecentListProps {
  drafts: StudioProjectDraft[];
  isLoading: boolean;
  error: string | null;
  onEditDraft: (draftId: string) => void;
  onRetry?: () => void;
  onCreateNew?: () => void;
}

function formatUpdatedTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}

export const StudioHubRecentList: React.FC<StudioHubRecentListProps> = ({
  drafts,
  isLoading,
  error,
  onEditDraft,
  onRetry,
  onCreateNew
}) => {
  const { t } = useI18n();
  if (error) {
    return (
      <div
        data-testid="drafts-error-state"
        className="p-6 rounded-xl bg-studio-panel border border-studio-danger/30 text-center"
      >
        <p className="text-studio-danger text-sm font-medium mb-1">
          Failed to load recent experiences
        </p>
        <p className="text-studio-muted text-xs mb-4 leading-relaxed">
          {error}
        </p>
        {onRetry && (
          <button
            type="button"
            data-testid="drafts-retry-btn"
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-studio-panel hover:bg-studio-card border border-studio-border hover:border-studio-muted text-studio-text transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        data-testid="drafts-loading-state"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-28 rounded-xl bg-studio-panel/60 border border-studio-border/50 animate-pulse p-4 flex flex-col justify-between"
          >
            <div className="h-4 bg-studio-border/60 rounded w-2/3" />
            <div className="h-3 bg-studio-border/40 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div
        data-testid="drafts-empty-state"
        className="p-8 rounded-xl bg-studio-panel border border-studio-border text-center"
      >
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-studio-surface border border-studio-border flex items-center justify-center text-studio-muted">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <h4 className="text-studio-text font-medium text-sm">
          No saved experiences yet
        </h4>
        <p className="text-studio-muted text-xs mt-1 mb-4 max-w-sm mx-auto leading-relaxed">
          Create your first 3D experience from a starter template above or start from a blank canvas.
        </p>
        {onCreateNew && (
          <button
            type="button"
            data-testid="create-first-experience-btn"
            onClick={onCreateNew}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-studio-accent hover:bg-studio-accent/90 text-studio-on-accent transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-studio-accent/40"
          >
            Create First Experience
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="drafts-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {drafts.map((draft) => (
        <div
          key={draft.id}
          data-testid={`draft-card-${draft.id}`}
          className="group flex flex-col justify-between bg-studio-panel hover:bg-studio-card border border-studio-border hover:border-studio-accent/70 rounded-xl p-4 transition-all duration-200 shadow-sm"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-studio-text font-semibold text-sm group-hover:text-studio-accent transition-colors truncate">
                {draft.title || 'Untitled Experience'}
              </h4>
              {draft.isAutosave && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-studio-surface text-studio-muted border border-studio-border">
                  Autosave
                </span>
              )}
              {draft.accessRole && draft.accessRole !== 'owner' && (
                <span data-testid={`draft-shared-badge-${draft.id}`} className="studio-chip-success text-[10px] px-1.5 py-0.5">
                  {t.team.sharedBadge} - {draft.accessRole === 'viewer' ? t.team.roleViewer : t.team.roleEditor}
                </span>
              )}
            </div>

            {draft.description && (
              <p className="text-studio-muted text-xs mt-1 line-clamp-2 leading-relaxed">
                {draft.description}
              </p>
            )}

            <div className="flex items-center gap-2 mt-3 text-[11px] text-studio-muted">
              <span>Updated: {formatUpdatedTime(draft.updatedAt || draft.createdAt)}</span>
              {draft.versionNumber && (
                <>
                  <span>•</span>
                  <span>v{draft.versionNumber}</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-studio-border/50 flex items-center justify-between">
            <span className="text-[11px] font-mono text-studio-muted/70 truncate max-w-[120px]">
              {draft.id}
            </span>
            <button
              type="button"
              data-testid={`edit-draft-btn-${draft.id}`}
              onClick={() => onEditDraft(draft.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-studio-surface hover:bg-studio-panel text-studio-text border border-studio-border hover:border-studio-accent/60 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-studio-accent/40"
            >
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
