// Studio ribbon: tab strip plus the group body for the active tab.

import React from 'react';
import type { StudioRibbonActions, StudioRibbonTab } from './ribbonTypes';
import {
  AnimationGroups,
  HomeGroups,
  ModelGroups,
  PublishGroups,
  ScriptGroups,
  TerrainGroups
} from './ribbonGroups';

export type { StudioRibbonActions, StudioRibbonTab, StudioPanelName } from './ribbonTypes';
export { DEFAULT_PANELS } from './ribbonTypes';

const TABS: { id: StudioRibbonTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'model', label: 'Model' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'script', label: 'Script' },
  { id: 'animation', label: 'Animation' },
  { id: 'publish', label: 'Publish' }
];

const GROUPS: Record<StudioRibbonTab, React.FC<{ a: StudioRibbonActions }>> = {
  home: HomeGroups,
  model: ModelGroups,
  terrain: TerrainGroups,
  script: ScriptGroups,
  animation: AnimationGroups,
  publish: PublishGroups
};

export const StudioRibbon: React.FC<{
  activeTab: StudioRibbonTab;
  onTab: (tab: StudioRibbonTab) => void;
  actions: StudioRibbonActions;
}> = ({ activeTab, onTab, actions }) => {
  const Groups = GROUPS[activeTab];
  return (
    <div className="bg-studio-ribbon border-b border-studio-border shrink-0">
      <div className="flex items-center gap-0.5 px-2 h-7 border-b border-studio-border/60">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTab(tab.id)}
            data-testid={`studio-ribbon-tab-${tab.id}`}
            className={`px-3 h-full text-[11px] font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'text-studio-text border-studio-accent bg-studio-card/60'
                : 'text-studio-muted border-transparent hover:text-studio-text hover:bg-studio-card/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto pr-1 text-[10px] font-mono text-studio-muted/70 hidden md:inline">
          Mochi Studio 1.0
        </span>
      </div>

      <div className="flex items-stretch gap-0.5 px-2 py-1 overflow-x-auto">
        <Groups a={actions} />
      </div>
    </div>
  );
};
