// Layout system types for Mochi Studio workspace docking and splitting.
// Represents a binary split tree with tabbed leaf panes.

import type React from 'react';

export type StudioPanelId =
  | 'viewport'
  | 'toolbox'
  | 'explorer'
  | 'properties'
  | 'output'
  | 'assets';

export type SplitDirection = 'horizontal' | 'vertical';

export interface TabPaneNode {
  id: string;
  type: 'pane';
  tabs: StudioPanelId[];
  activeTabId: StudioPanelId;
}

export interface SplitNode {
  id: string;
  type: 'split';
  direction: SplitDirection;
  splitRatio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = SplitNode | TabPaneNode;

export type DropZone =
  | 'tab'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'window-left'
  | 'window-right'
  | 'window-top'
  | 'window-bottom';

export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DropTarget {
  paneId?: string;
  zone: DropZone;
  rect: LayoutRect;
}

export interface DragState {
  panelId: StudioPanelId;
  sourcePaneId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isThresholdMet: boolean;
  target: DropTarget | null;
}

export interface PanelMeta {
  id: StudioPanelId;
  title: string;
  closable: boolean;
  minWidth: number;
  minHeight: number;
}

export type StudioPanelSlots = Partial<Record<StudioPanelId, React.ReactNode>>;

export interface LayoutContextValue {
  layout: LayoutNode;
  slots: StudioPanelSlots;
  dragState: DragState | null;
  activePanels: Record<string, boolean>;
  selectTab: (paneId: string, panelId: StudioPanelId) => void;
  closePanel: (panelId: StudioPanelId) => void;
  resizeSplit: (splitId: string, newRatio: number) => void;
  startDrag: (panelId: StudioPanelId, sourcePaneId: string, e: React.PointerEvent) => void;
  resetLayout: () => void;
  registerPaneRect: (paneId: string, element: HTMLElement | null) => void;
}
