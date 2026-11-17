// Pure unit tests for Studio workspace layout tree operations, mutations, and hit-testing.

import { describe, expect, it } from 'vitest';
import {
  createDefaultLayout,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO
} from '../src/components/studio/layout/layoutDefaults';
import {
  calculateDropTarget,
  computePreviewRect,
  isPointInsideRect
} from '../src/components/studio/layout/layoutDragOps';
import {
  dockToEdge,
  filterTreeByVisibility,
  insertSplit,
  insertTab,
  normalizeTree,
  removePanel,
  switchActiveTab,
  updateSplitRatio
} from '../src/components/studio/layout/layoutMutations';
import {
  cloneTree,
  countLeaves,
  findNodeById,
  findPaneByPanelId,
  findParentNode,
  getAllPanels,
  isPaneNode,
  isSplitNode
} from '../src/components/studio/layout/layoutTreeOps';
import type { LayoutNode, LayoutRect, TabPaneNode } from '../src/components/studio/layout/layoutTypes';

describe('Layout tree query operations', () => {
  it('creates default layout with all standard tool panels', () => {
    const layout = createDefaultLayout();
    expect(isSplitNode(layout)).toBe(true);
    const panels = getAllPanels(layout);
    expect(panels).toEqual(
      expect.arrayContaining(['toolbox', 'viewport', 'output', 'explorer', 'properties'])
    );
    expect(countLeaves(layout)).toBe(5);
  });

  it('finds nodes by ID correctly', () => {
    const layout = createDefaultLayout();
    expect(findNodeById(layout, 'split_root')?.id).toBe('split_root');
    expect(findNodeById(layout, 'pane_viewport')?.type).toBe('pane');
    expect(findNodeById(layout, 'non_existent_id')).toBeNull();
  });

  it('finds panes by panel ID', () => {
    const layout = createDefaultLayout();
    const pane = findPaneByPanelId(layout, 'explorer');
    expect(pane?.id).toBe('pane_explorer');
    expect(pane?.tabs).toContain('explorer');
    expect(findPaneByPanelId(layout, 'assets')).toBeNull();
  });

  it('finds parent split nodes and indicates child slot', () => {
    const layout = createDefaultLayout();
    const parentInfo = findParentNode(layout, 'pane_toolbox');
    expect(parentInfo?.parent.id).toBe('split_root');
    expect(parentInfo?.childKey).toBe('first');

    const viewportParent = findParentNode(layout, 'pane_viewport');
    expect(viewportParent?.parent.id).toBe('split_viewport_output');
    expect(viewportParent?.childKey).toBe('first');
  });

  it('clones trees without reference sharing', () => {
    const layout = createDefaultLayout();
    const cloned = cloneTree(layout);
    expect(cloned).toEqual(layout);
    expect(cloned).not.toBe(layout);
  });
});

describe('Layout mutations: tabs and splits', () => {
  it('inserts a panel as a tab in an existing pane and activates it', () => {
    const layout = createDefaultLayout();
    const updated = insertTab(layout, 'pane_explorer', 'properties');
    const explorerPane = findPaneByPanelId(updated, 'explorer');
    expect(explorerPane?.tabs).toEqual(['explorer', 'properties']);
    expect(explorerPane?.activeTabId).toBe('properties');
    // Properties pane should have collapsed since it is moved
    expect(findNodeById(updated, 'pane_properties')).toBeNull();
  });

  it('switches active tab within a pane', () => {
    const layout = createDefaultLayout();
    const withTab = insertTab(layout, 'pane_explorer', 'properties');
    const switched = switchActiveTab(withTab, 'pane_explorer', 'explorer');
    expect(findPaneByPanelId(switched, 'explorer')?.activeTabId).toBe('explorer');
  });

  it('inserts horizontal and vertical splits', () => {
    const simplePane: TabPaneNode = {
      id: 'pane_1',
      type: 'pane',
      tabs: ['viewport'],
      activeTabId: 'viewport'
    };

    const splitH = insertSplit(simplePane, 'pane_1', 'explorer', 'horizontal', 'first', 0.3);
    expect(isSplitNode(splitH)).toBe(true);
    if (isSplitNode(splitH)) {
      expect(splitH.direction).toBe('horizontal');
      expect(splitH.splitRatio).toBe(0.3);
      expect(isPaneNode(splitH.first) && isPaneNode(splitH.second)).toBe(true);
    }

    const splitV = insertSplit(simplePane, 'pane_1', 'output', 'vertical', 'second', 0.5);
    if (isSplitNode(splitV)) {
      expect(splitV.direction).toBe('vertical');
      expect(splitV.second.type).toBe('pane');
    }
  });

  it('updates split ratio with clamping between min and max bounds', () => {
    const layout = createDefaultLayout();
    const updated = updateSplitRatio(layout, 'split_root', 0.35);
    const root = findNodeById(updated, 'split_root');
    if (root && isSplitNode(root)) expect(root.splitRatio).toBe(0.35);

    const clampedLow = updateSplitRatio(layout, 'split_root', 0.01);
    if (clampedLow && isSplitNode(clampedLow)) expect(clampedLow.splitRatio).toBe(MIN_SPLIT_RATIO);

    const clampedHigh = updateSplitRatio(layout, 'split_root', 0.99);
    if (clampedHigh && isSplitNode(clampedHigh)) expect(clampedHigh.splitRatio).toBe(MAX_SPLIT_RATIO);
  });
});

describe('Layout mutations: panel removal and branch normalization', () => {
  it('removes a tab from a multi-tab pane and shifts active tab', () => {
    const simplePane: TabPaneNode = {
      id: 'pane_1',
      type: 'pane',
      tabs: ['explorer', 'properties'],
      activeTabId: 'explorer'
    };
    const removed = removePanel(simplePane, 'explorer');
    expect(removed).not.toBeNull();
    if (removed && isPaneNode(removed)) {
      expect(removed.tabs).toEqual(['properties']);
      expect(removed.activeTabId).toBe('properties');
    }
  });

  it('collapses parent split node when sole tab is removed', () => {
    const layout = createDefaultLayout();
    const updated = removePanel(layout, 'toolbox');
    expect(updated).not.toBeNull();
    if (updated) {
      expect(findPaneByPanelId(updated, 'toolbox')).toBeNull();
      expect(updated.id).toBe('split_center_right');
    }
  });

  it('normalizes tree by pruning empty panes and unary splits', () => {
    const emptyPane: TabPaneNode = { id: 'p_empty', type: 'pane', tabs: [], activeTabId: 'output' };
    expect(normalizeTree(emptyPane)).toBeNull();

    const surviving: TabPaneNode = { id: 'p_survivor', type: 'pane', tabs: ['viewport'], activeTabId: 'viewport' };
    const unarySplit: LayoutNode = {
      id: 'split_unary',
      type: 'split',
      direction: 'horizontal',
      splitRatio: 0.5,
      first: emptyPane,
      second: surviving
    };
    expect(normalizeTree(unarySplit)).toEqual(surviving);
  });

  it('docks panel to window edges', () => {
    const simple: TabPaneNode = { id: 'pane_main', type: 'pane', tabs: ['viewport'], activeTabId: 'viewport' };
    const dockedLeft = dockToEdge(simple, 'toolbox', 'left', 0.2);
    if (isSplitNode(dockedLeft)) {
      expect(dockedLeft.direction).toBe('horizontal');
      expect(dockedLeft.splitRatio).toBe(0.2);
      expect((dockedLeft.first as TabPaneNode).tabs).toEqual(['toolbox']);
    }

    const dockedBottom = dockToEdge(simple, 'output', 'bottom', 0.25);
    if (isSplitNode(dockedBottom)) {
      expect(dockedBottom.direction).toBe('vertical');
      expect((dockedBottom.second as TabPaneNode).tabs).toEqual(['output']);
    }
  });

  it('filters layout tree according to visibility flags', () => {
    const layout = createDefaultLayout();
    const filtered = filterTreeByVisibility(layout, {
      toolbox: false,
      explorer: false,
      properties: false,
      output: false
    });
    expect(filtered).not.toBeNull();
    if (filtered && isPaneNode(filtered)) expect(filtered.tabs).toEqual(['viewport']);
  });
});

describe('Geometric hit-testing for drop zones', () => {
  const workspace: LayoutRect = { left: 0, top: 0, width: 1000, height: 800 };
  const paneA: LayoutRect = { left: 100, top: 100, width: 400, height: 400 };

  it('detects outer window edges', () => {
    expect(calculateDropTarget(10, 400, workspace, [])?.zone).toBe('window-left');
    expect(calculateDropTarget(990, 400, workspace, [])?.zone).toBe('window-right');
    expect(calculateDropTarget(500, 10, workspace, [])?.zone).toBe('window-top');
    expect(calculateDropTarget(500, 790, workspace, [])?.zone).toBe('window-bottom');
  });

  it('detects pane center as tab drop zone', () => {
    const target = calculateDropTarget(300, 300, workspace, [{ paneId: 'pane_a', rect: paneA }]);
    expect(target?.paneId).toBe('pane_a');
    expect(target?.zone).toBe('tab');
    expect(target?.rect).toEqual(paneA);
  });

  it('detects directional split zones inside a pane', () => {
    const paneEntries = [{ paneId: 'pane_a', rect: paneA }];
    expect(calculateDropTarget(120, 300, workspace, paneEntries)?.zone).toBe('left');
    expect(calculateDropTarget(480, 300, workspace, paneEntries)?.zone).toBe('right');
    expect(calculateDropTarget(300, 120, workspace, paneEntries)?.zone).toBe('top');
    expect(calculateDropTarget(300, 480, workspace, paneEntries)?.zone).toBe('bottom');
  });

  it('computes preview rects accurately', () => {
    const base: LayoutRect = { left: 0, top: 0, width: 200, height: 100 };
    expect(computePreviewRect('left', base)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(computePreviewRect('right', base)).toEqual({ left: 100, top: 0, width: 100, height: 100 });
    expect(computePreviewRect('top', base)).toEqual({ left: 0, top: 0, width: 200, height: 50 });
    expect(computePreviewRect('bottom', base)).toEqual({ left: 0, top: 50, width: 200, height: 50 });
  });

  it('checks points inside rectangles correctly', () => {
    const rect: LayoutRect = { left: 10, top: 10, width: 100, height: 50 };
    expect(isPointInsideRect(20, 20, rect)).toBe(true);
    expect(isPointInsideRect(5, 20, rect)).toBe(false);
    expect(isPointInsideRect(20, 70, rect)).toBe(false);
  });
});

describe('Layout regression protections: self-drop, self-split, invalid targets, and NaN', () => {
  it('preserves panel and switches active tab on self-pane drop onto tab zone', () => {
    const layout = createDefaultLayout();
    const withTwoTabs = insertTab(layout, 'pane_explorer', 'properties', false);
    const selfDropped = insertTab(withTwoTabs, 'pane_explorer', 'properties', true);
    const pane = findPaneByPanelId(selfDropped, 'properties');
    expect(pane?.tabs).toEqual(['explorer', 'properties']);
    expect(pane?.activeTabId).toBe('properties');
  });

  it('leaves tree intact when attempting self-pane split on a sole tab', () => {
    const layout = createDefaultLayout();
    const result = insertSplit(layout, 'pane_toolbox', 'toolbox', 'horizontal', 'first', 0.5);
    expect(result).toEqual(layout);
    expect(countLeaves(result)).toBe(5);
    expect(findPaneByPanelId(result, 'toolbox')?.id).toBe('pane_toolbox');
  });

  it('leaves tree intact when dropping into non-existent or invalid pane ID', () => {
    const layout = createDefaultLayout();
    const tabResult = insertTab(layout, 'invalid_id', 'toolbox');
    expect(tabResult).toEqual(layout);
    expect(findPaneByPanelId(tabResult, 'toolbox')).not.toBeNull();

    const splitResult = insertSplit(layout, 'invalid_id', 'toolbox', 'vertical', 'first', 0.5);
    expect(splitResult).toEqual(layout);
    expect(findPaneByPanelId(splitResult, 'toolbox')).not.toBeNull();
  });

  it('rejects NaN split ratio and preserves original ratio', () => {
    const layout = createDefaultLayout();
    const updated = updateSplitRatio(layout, 'split_root', NaN);
    const root = findNodeById(updated, 'split_root');
    expect(isSplitNode(root!)).toBe(true);
    if (root && isSplitNode(root)) {
      expect(Number.isFinite(root.splitRatio)).toBe(true);
      expect(root.splitRatio).toBe(0.18);
    }
  });
});
