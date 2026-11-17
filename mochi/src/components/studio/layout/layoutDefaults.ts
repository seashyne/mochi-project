// Default layout tree configuration and metadata for Mochi Studio tool windows.

import type { LayoutNode, PanelMeta, StudioPanelId } from './layoutTypes';

export const STORAGE_KEY_LAYOUT = 'mochi_studio_layout_v1';
export const DRAG_THRESHOLD_PX = 4;
export const MIN_SPLIT_RATIO = 0.05;
export const MAX_SPLIT_RATIO = 0.95;

export const PANEL_METADATA: Record<StudioPanelId, PanelMeta> = {
  viewport: {
    id: 'viewport',
    title: 'Viewport',
    closable: false,
    minWidth: 200,
    minHeight: 160
  },
  toolbox: {
    id: 'toolbox',
    title: 'Toolbox',
    closable: true,
    minWidth: 180,
    minHeight: 120
  },
  explorer: {
    id: 'explorer',
    title: 'Explorer',
    closable: true,
    minWidth: 160,
    minHeight: 100
  },
  properties: {
    id: 'properties',
    title: 'Properties',
    closable: true,
    minWidth: 160,
    minHeight: 100
  },
  output: {
    id: 'output',
    title: 'Output',
    closable: true,
    minWidth: 160,
    minHeight: 80
  },
  assets: {
    id: 'assets',
    title: 'Asset Library',
    closable: true,
    minWidth: 180,
    minHeight: 120
  }
};

export const DEFAULT_STUDIO_LAYOUT: LayoutNode = {
  id: 'split_root',
  type: 'split',
  direction: 'horizontal',
  splitRatio: 0.18,
  first: {
    id: 'pane_toolbox',
    type: 'pane',
    tabs: ['toolbox'],
    activeTabId: 'toolbox'
  },
  second: {
    id: 'split_center_right',
    type: 'split',
    direction: 'horizontal',
    splitRatio: 0.76,
    first: {
      id: 'split_viewport_output',
      type: 'split',
      direction: 'vertical',
      splitRatio: 0.78,
      first: {
        id: 'pane_viewport',
        type: 'pane',
        tabs: ['viewport'],
        activeTabId: 'viewport'
      },
      second: {
        id: 'pane_output',
        type: 'pane',
        tabs: ['output'],
        activeTabId: 'output'
      }
    },
    second: {
      id: 'split_explorer_properties',
      type: 'split',
      direction: 'vertical',
      splitRatio: 0.45,
      first: {
        id: 'pane_explorer',
        type: 'pane',
        tabs: ['explorer'],
        activeTabId: 'explorer'
      },
      second: {
        id: 'pane_properties',
        type: 'pane',
        tabs: ['properties'],
        activeTabId: 'properties'
      }
    }
  }
};

export function createDefaultLayout(): LayoutNode {
  return JSON.parse(JSON.stringify(DEFAULT_STUDIO_LAYOUT));
}
