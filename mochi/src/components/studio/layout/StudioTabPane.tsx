// Leaf tab pane container rendering the tab strip and the active panel content.

import React from 'react';
import { useStudioLayoutContext } from './StudioLayoutContext';
import { StudioTabBar } from './StudioTabBar';
import type { TabPaneNode } from './layoutTypes';

export interface StudioTabPaneProps {
  pane: TabPaneNode;
}

export const StudioTabPane: React.FC<StudioTabPaneProps> = ({ pane }) => {
  const { slots, selectTab, closePanel, startDrag, registerPaneRect } =
    useStudioLayoutContext();

  return (
    <div
      ref={(el) => registerPaneRect(pane.id, el)}
      data-pane-id={pane.id}
      className="flex flex-col flex-1 min-w-0 min-h-0 h-full w-full bg-studio-panel overflow-hidden border border-studio-border/30"
    >
      <StudioTabBar
        paneId={pane.id}
        tabs={pane.tabs}
        activeTabId={pane.activeTabId}
        onSelectTab={(tabId) => selectTab(pane.id, tabId)}
        onCloseTab={closePanel}
        onStartDragTab={(tabId, e) => startDrag(tabId, pane.id, e)}
      />

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {slots[pane.activeTabId]}
      </div>
    </div>
  );
};
