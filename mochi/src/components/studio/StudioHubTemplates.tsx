// Modular Template Chooser Grid Component for Mochi Studio Experience Hub
// Displays starter templates with eye-friendly dark theming and debounce protection

import React, { useState, useMemo, useCallback } from 'react';
import type { StudioTemplateDefinition } from './templates/studioTemplates';

export interface StudioHubTemplatesProps {
  templates: StudioTemplateDefinition[];
  onUseTemplate: (template: StudioTemplateDefinition) => void;
  searchQuery?: string;
  isCreating?: boolean;
}

function TemplatePreviewGraphic({ type }: { type: string }) {
  if (type === 'grid') {
    return (
      <svg className="w-full h-full" viewBox="0 0 120 80" fill="none" aria-hidden="true">
        <rect width="120" height="80" fill="#1e1e24" />
        <path d="M10 60 L60 25 L110 60 L60 75 Z" fill="#282830" stroke="#363640" strokeWidth="1" />
        <path d="M25 50 L60 25 L95 50" stroke="#363640" strokeWidth="0.8" strokeDasharray="2 2" />
        <path d="M35 65 L85 30" stroke="#363640" strokeWidth="0.8" strokeDasharray="2 2" />
        <rect x="52" y="44" width="16" height="12" rx="2" fill="#00a2ff" fillOpacity="0.85" stroke="#38bdf8" strokeWidth="1" />
        <circle cx="60" cy="50" r="2.5" fill="#ffffff" />
      </svg>
    );
  }
  if (type === 'terrain') {
    return (
      <svg className="w-full h-full" viewBox="0 0 120 80" fill="none" aria-hidden="true">
        <rect width="120" height="80" fill="#1e1e24" />
        <path d="M10 65 Q 40 40 60 55 T 110 50 L110 75 L10 75 Z" fill="#166534" fillOpacity="0.8" />
        <path d="M20 58 Q 50 45 75 52 T 110 58 L110 75 L20 75 Z" fill="#15803d" />
        <rect x="42" y="46" width="14" height="10" rx="2" fill="#00a2ff" fillOpacity="0.85" stroke="#38bdf8" strokeWidth="1" />
        <circle cx="49" cy="51" r="2" fill="#ffffff" />
        <circle cx="85" cy="35" r="7" fill="#14532d" fillOpacity="0.7" />
        <rect x="83.5" y="42" width="3" height="6" fill="#64748b" />
      </svg>
    );
  }
  // Course / Obby preview graphic
  return (
    <svg className="w-full h-full" viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <rect width="120" height="80" fill="#1e1e24" />
      <rect x="10" y="58" width="100" height="18" fill="#ef4444" fillOpacity="0.25" stroke="#ef4444" strokeWidth="0.8" />
      <rect x="15" y="52" width="18" height="8" rx="2" fill="#3b82f6" />
      <rect x="40" y="44" width="12" height="6" rx="1.5" fill="#a855f7" />
      <rect x="58" y="36" width="12" height="6" rx="1.5" fill="#ec4899" />
      <rect x="76" y="28" width="12" height="6" rx="1.5" fill="#06b6d4" />
      <rect x="92" y="20" width="16" height="12" rx="2" fill="#f59e0b" />
      <polygon points="100,10 102,15 107,15 103,18 105,23 100,20 95,23 97,18 93,15 98,15" fill="#fbbf24" />
    </svg>
  );
}

export const StudioHubTemplates: React.FC<StudioHubTemplatesProps> = ({
  templates,
  onUseTemplate,
  searchQuery = '',
  isCreating = false
}) => {
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);

  const handleTriggerUse = useCallback(
    (template: StudioTemplateDefinition) => {
      if (isCreating || busyTemplateId !== null) return;
      setBusyTemplateId(template.id);
      try {
        onUseTemplate(template);
      } finally {
        setTimeout(() => {
          setBusyTemplateId(null);
        }, 600);
      }
    },
    [isCreating, busyTemplateId, onUseTemplate]
  );

  const filteredTemplates = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) {
      return templates;
    }
    const q = searchQuery.toLowerCase().trim();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.previewType.toLowerCase().includes(q)
    );
  }, [templates, searchQuery]);

  if (filteredTemplates.length === 0) {
    return (
      <div
        data-testid="zero-matches-guidance"
        className="p-8 text-center bg-studio-panel/50 rounded-xl border border-studio-border"
      >
        <p className="text-studio-muted text-sm font-medium">
          No templates match your search criteria.
        </p>
        <p className="text-xs text-studio-muted/70 mt-1">
          Try clearing the search query or pick a starter scene from the default catalog.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="template-chooser-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {filteredTemplates.map((tpl) => {
        const isBusy = busyTemplateId === tpl.id || isCreating;
        return (
          <div
            key={tpl.id}
            data-testid={`template-card-${tpl.id}`}
            className="group flex flex-col bg-studio-panel hover:bg-studio-card border border-studio-border hover:border-studio-accent/70 rounded-xl overflow-hidden transition-all duration-200 shadow-sm"
          >
            {/* Visual Thumbnail Preview */}
            <div className="relative h-32 w-full overflow-hidden border-b border-studio-border/60 bg-studio-bg">
              <TemplatePreviewGraphic type={tpl.previewType} />
              <div className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-studio-panel/90 text-studio-muted border border-studio-border/80">
                {tpl.previewType}
              </div>
            </div>

            {/* Template Information */}
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-studio-text font-semibold text-sm group-hover:text-studio-accent transition-colors">
                  {tpl.name}
                </h3>
                <p className="text-studio-muted text-xs mt-1 leading-relaxed line-clamp-2">
                  {tpl.description}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tpl.grid && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-studio-surface text-studio-muted border border-studio-border">
                      {tpl.grid}x{tpl.grid} Grid
                    </span>
                  )}
                  {tpl.hasSpawn && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-studio-surface text-studio-info border border-studio-border">
                      Spawn Pad
                    </span>
                  )}
                  {tpl.hasHazard && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-studio-surface text-studio-danger border border-studio-border">
                      Hazard Floor
                    </span>
                  )}
                  {tpl.hasGoal && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-studio-surface text-studio-warning border border-studio-border">
                      Victory Podium
                    </span>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-studio-border/50 flex items-center justify-between">
                <span className="text-[11px] text-studio-muted">
                  {tpl.objects.length} objects
                </span>
                <button
                  type="button"
                  data-testid={`use-template-btn-${tpl.id}`}
                  disabled={isBusy}
                  onClick={() => handleTriggerUse(tpl)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-studio-accent hover:bg-studio-accent/90 text-studio-on-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none focus:ring-2 focus:ring-studio-accent/40"
                >
                  {isBusy ? 'Creating...' : 'Use Template'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
