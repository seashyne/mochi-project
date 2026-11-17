// Tab strip rendering tab buttons, active accent indicator, and close/drag handles.

import React from 'react';
import { PANEL_METADATA } from './layoutDefaults';
import type { StudioPanelId } from './layoutTypes';

export interface StudioTabBarProps {
  paneId: string;
  tabs: StudioPanelId[];
  activeTabId: StudioPanelId;
  onSelectTab: (panelId: StudioPanelId) => void;
  onCloseTab: (panelId: StudioPanelId) => void;
  onStartDragTab: (panelId: StudioPanelId, e: React.PointerEvent) => void;
}

const PANEL_ICONS: Record<StudioPanelId, React.ReactNode> = {
  viewport: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  toolbox: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  explorer: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  properties: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  output: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  assets: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
};

export const StudioTabBar: React.FC<StudioTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onStartDragTab
}) => (
  <div
    role="tablist"
    className="h-7 flex items-center bg-studio-ribbon border-b border-studio-border shrink-0 select-none px-1 overflow-x-auto min-w-0"
  >
    {tabs.map((tab) => {
      const meta = PANEL_METADATA[tab] ?? {
        id: tab,
        title: tab,
        closable: true,
        minWidth: 160,
        minHeight: 100
      };
      const isActive = tab === activeTabId;

      return (
        <div
          key={tab}
          role="tab"
          tabIndex={0}
          aria-selected={isActive}
          data-testid={`studio-dock-tab-${tab}`}
          onClick={() => onSelectTab(tab)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectTab(tab);
            }
          }}
          onPointerDown={(e) => onStartDragTab(tab, e)}
          className={`group flex items-center gap-1.5 h-full px-2.5 text-[11px] cursor-pointer transition-colors border-e border-studio-border/50 shrink-0 ${
            isActive
              ? 'bg-studio-panel text-studio-text border-t-2 border-studio-accent font-medium'
              : 'text-studio-muted hover:text-studio-text hover:bg-studio-card/60'
          }`}
        >
          {PANEL_ICONS[tab]}
          <span className="truncate max-w-[120px]">{meta.title}</span>

          {meta.closable && (
            <button
              type="button"
              role="button"
              aria-label={`Close ${meta.title}`}
              data-testid={`studio-dock-tab-close-${tab}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab);
              }}
              className="ms-1 p-0.5 rounded text-studio-muted hover:text-studio-text hover:bg-studio-card/80 opacity-60 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      );
    })}
  </div>
);
