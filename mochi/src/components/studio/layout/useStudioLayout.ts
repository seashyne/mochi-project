// Studio layout state hook with safe localStorage persistence and mutation dispatchers.

import { useCallback, useEffect, useState } from 'react';
import { createDefaultLayout, STORAGE_KEY_LAYOUT } from './layoutDefaults';
import {
  dockToEdge,
  insertSplit,
  insertTab,
  removePanel,
  switchActiveTab,
  updateSplitRatio
} from './layoutMutations';
import { getAllPanels } from './layoutTreeOps';
import type { DropTarget, LayoutNode, StudioPanelId } from './layoutTypes';

function loadPersistedLayout(): LayoutNode {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultLayout();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LAYOUT);
    if (!raw) return createDefaultLayout();
    const parsed = JSON.parse(raw) as LayoutNode;
    // Validate that required viewport panel exists
    const panels = getAllPanels(parsed);
    if (!panels.includes('viewport')) {
      return createDefaultLayout();
    }
    return parsed;
  } catch {
    return createDefaultLayout();
  }
}

function savePersistedLayout(layout: LayoutNode) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout));
  } catch {
    // Ignore storage quota errors
  }
}

export function useStudioLayout(initialLayout?: LayoutNode) {
  const [layout, setLayout] = useState<LayoutNode>(() => {
    if (initialLayout) return initialLayout;
    return loadPersistedLayout();
  });

  // Persist layout changes
  useEffect(() => {
    savePersistedLayout(layout);
  }, [layout]);

  const selectTab = useCallback((paneId: string, panelId: StudioPanelId) => {
    setLayout((prev) => switchActiveTab(prev, paneId, panelId));
  }, []);

  const closePanel = useCallback((panelId: StudioPanelId) => {
    if (panelId === 'viewport') return; // Viewport cannot be closed
    setLayout((prev) => {
      const next = removePanel(prev, panelId);
      return next ?? prev;
    });
  }, []);

  const resizeSplit = useCallback((splitId: string, newRatio: number) => {
    setLayout((prev) => updateSplitRatio(prev, splitId, newRatio));
  }, []);

  const resetLayout = useCallback(() => {
    const fresh = createDefaultLayout();
    setLayout(fresh);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY_LAYOUT);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const handleDropTarget = useCallback((panelId: StudioPanelId, target: DropTarget) => {
    setLayout((prev) => {
      if (target.zone === 'tab' && target.paneId) {
        return insertTab(prev, target.paneId, panelId);
      }
      if (target.zone === 'left' && target.paneId) {
        return insertSplit(prev, target.paneId, panelId, 'horizontal', 'first');
      }
      if (target.zone === 'right' && target.paneId) {
        return insertSplit(prev, target.paneId, panelId, 'horizontal', 'second');
      }
      if (target.zone === 'top' && target.paneId) {
        return insertSplit(prev, target.paneId, panelId, 'vertical', 'first');
      }
      if (target.zone === 'bottom' && target.paneId) {
        return insertSplit(prev, target.paneId, panelId, 'vertical', 'second');
      }
      if (target.zone.startsWith('window-')) {
        const edge = target.zone.replace('window-', '') as 'left' | 'right' | 'top' | 'bottom';
        return dockToEdge(prev, panelId, edge);
      }
      return prev;
    });
  }, []);

  return {
    layout,
    setLayout,
    selectTab,
    closePanel,
    resizeSplit,
    resetLayout,
    handleDropTarget
  };
}
