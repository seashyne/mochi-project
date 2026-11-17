// Pure tree mutation operations for splitting, tabbing, removing, and docking.

import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO } from './layoutDefaults';
import { cloneTree, findNodeById, generateNodeId, isPaneNode } from './layoutTreeOps';
import type { LayoutNode, SplitDirection, SplitNode, StudioPanelId, TabPaneNode } from './layoutTypes';

export function normalizeTree(node: LayoutNode): LayoutNode | null {
  if (isPaneNode(node)) {
    if (node.tabs.length === 0) {
      return null;
    }
    const activeTab = node.tabs.includes(node.activeTabId) ? node.activeTabId : node.tabs[0];
    return {
      ...node,
      activeTabId: activeTab
    };
  }

  const normFirst = normalizeTree(node.first);
  const normSecond = normalizeTree(node.second);

  if (!normFirst && !normSecond) return null;
  if (!normFirst) return normSecond;
  if (!normSecond) return normFirst;

  return {
    ...node,
    first: normFirst,
    second: normSecond
  };
}

export function removePanel(root: LayoutNode, panelId: StudioPanelId): LayoutNode | null {
  function stripFromNode(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      const remainingTabs = node.tabs.filter((t) => t !== panelId);
      const active = remainingTabs.includes(node.activeTabId)
        ? node.activeTabId
        : (remainingTabs[0] ?? node.activeTabId);
      return {
        ...node,
        tabs: remainingTabs,
        activeTabId: active
      };
    }
    return {
      ...node,
      first: stripFromNode(node.first),
      second: stripFromNode(node.second)
    };
  }

  const stripped = stripFromNode(cloneTree(root));
  return normalizeTree(stripped);
}

export function insertTab(
  root: LayoutNode,
  targetPaneId: string,
  panelId: StudioPanelId,
  activate = true
): LayoutNode {
  const targetPane = findNodeById(root, targetPaneId);
  if (!targetPane || !isPaneNode(targetPane)) return root;
  if (targetPane.tabs.includes(panelId)) {
    return activate && targetPane.activeTabId !== panelId
      ? switchActiveTab(root, targetPaneId, panelId)
      : root;
  }

  const cleaned = removePanel(root, panelId) ?? root;

  function addToPane(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      if (node.id === targetPaneId) {
        const tabs = node.tabs.includes(panelId) ? node.tabs : [...node.tabs, panelId];
        return {
          ...node,
          tabs,
          activeTabId: activate ? panelId : node.activeTabId
        };
      }
      return node;
    }
    return {
      ...node,
      first: addToPane(node.first),
      second: addToPane(node.second)
    };
  }

  const modified = addToPane(cloneTree(cleaned));
  return normalizeTree(modified) ?? modified;
}

export function insertSplit(
  root: LayoutNode,
  targetPaneId: string,
  panelId: StudioPanelId,
  direction: SplitDirection,
  side: 'first' | 'second',
  ratio = 0.5
): LayoutNode {
  const targetPane = findNodeById(root, targetPaneId);
  if (!targetPane || !isPaneNode(targetPane)) return root;
  if (targetPane.tabs.length === 1 && targetPane.tabs[0] === panelId) {
    return root;
  }

  const cleaned = removePanel(root, panelId) ?? root;

  const newPane: TabPaneNode = {
    id: generateNodeId('pane'),
    type: 'pane',
    tabs: [panelId],
    activeTabId: panelId
  };

  function replaceInNode(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      if (node.id === targetPaneId) {
        const split: SplitNode = {
          id: generateNodeId('split'),
          type: 'split',
          direction,
          splitRatio: side === 'first' ? ratio : 1 - ratio,
          first: side === 'first' ? newPane : node,
          second: side === 'first' ? node : newPane
        };
        return split;
      }
      return node;
    }

    return {
      ...node,
      first: replaceInNode(node.first),
      second: replaceInNode(node.second)
    };
  }

  const modified = replaceInNode(cloneTree(cleaned));
  return normalizeTree(modified) ?? modified;
}

export function dockToEdge(
  root: LayoutNode,
  panelId: StudioPanelId,
  edge: 'left' | 'right' | 'top' | 'bottom',
  ratio = 0.25
): LayoutNode {
  const cleaned = removePanel(root, panelId);

  const newPane: TabPaneNode = {
    id: generateNodeId('pane'),
    type: 'pane',
    tabs: [panelId],
    activeTabId: panelId
  };

  if (!cleaned) {
    return newPane;
  }

  const isHorizontal = edge === 'left' || edge === 'right';
  const isFirst = edge === 'left' || edge === 'top';

  const newSplit: SplitNode = {
    id: generateNodeId('split'),
    type: 'split',
    direction: isHorizontal ? 'horizontal' : 'vertical',
    splitRatio: isFirst ? ratio : 1 - ratio,
    first: isFirst ? newPane : cleaned,
    second: isFirst ? cleaned : newPane
  };

  return newSplit;
}

export function updateSplitRatio(
  root: LayoutNode,
  splitId: string,
  newRatio: number,
  minRatio = MIN_SPLIT_RATIO,
  maxRatio = MAX_SPLIT_RATIO
): LayoutNode {
  if (!Number.isFinite(newRatio)) return root;
  const clamped = Math.max(minRatio, Math.min(maxRatio, newRatio));

  function updateNode(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) return node;
    if (node.id === splitId) {
      return {
        ...node,
        splitRatio: clamped
      };
    }
    return {
      ...node,
      first: updateNode(node.first),
      second: updateNode(node.second)
    };
  }

  return updateNode(cloneTree(root));
}

export function switchActiveTab(
  root: LayoutNode,
  paneId: string,
  tabId: StudioPanelId
): LayoutNode {
  function updateNode(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      if (node.id === paneId && node.tabs.includes(tabId)) {
        return {
          ...node,
          activeTabId: tabId
        };
      }
      return node;
    }
    return {
      ...node,
      first: updateNode(node.first),
      second: updateNode(node.second)
    };
  }

  return updateNode(cloneTree(root));
}

export function filterTreeByVisibility(
  root: LayoutNode,
  visiblePanels: Partial<Record<StudioPanelId, boolean>>
): LayoutNode | null {
  function filterNode(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      const filteredTabs = node.tabs.filter((tab) => visiblePanels[tab] !== false);
      const active = filteredTabs.includes(node.activeTabId)
        ? node.activeTabId
        : (filteredTabs[0] ?? node.activeTabId);
      return {
        ...node,
        tabs: filteredTabs,
        activeTabId: active
      };
    }
    return {
      ...node,
      first: filterNode(node.first),
      second: filterNode(node.second)
    };
  }

  const filtered = filterNode(cloneTree(root));
  return normalizeTree(filtered);
}
