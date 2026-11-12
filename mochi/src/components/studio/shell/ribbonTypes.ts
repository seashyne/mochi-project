// Ribbon contracts shared by the tab strip, the group bodies and the page shell.

import type { StudioObjectType } from '@/engine/studio/types';
import type { GizmoMode } from '@/engine/studio/transformGizmo';
import type { TerrainBrush } from '@/engine/studio/advancedTypes';

export type StudioRibbonTab = 'home' | 'model' | 'terrain' | 'script' | 'animation' | 'publish';
export type StudioPanelName = 'toolbox' | 'explorer' | 'properties' | 'output';

/** Every dock open: the layout a fresh project and Reset layout start from. */
export const DEFAULT_PANELS: Record<StudioPanelName, boolean> = {
  toolbox: true,
  explorer: true,
  properties: true,
  output: true
};

export interface StudioRibbonActions {
  gizmoMode: GizmoMode;
  onGizmoMode: (mode: GizmoMode) => void;
  snapping: boolean;
  onToggleSnap: () => void;
  onAddObject: (type: StudioObjectType) => void;
  hasSelection: boolean;
  isAnchored: boolean;
  onToggleAnchor: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  panels: Record<StudioPanelName, boolean>;
  onTogglePanel: (panel: StudioPanelName) => void;
  onOpenToolboxTab: (tab: string) => void;
  onPlaytest: () => void;
  onSave: () => void;
  isSaving: boolean;
  brush: TerrainBrush;
  onBrushChange: (patch: Partial<TerrainBrush>) => void;
  isSculpting: boolean;
  onToggleSculpting: () => void;
  onRunScript: () => void;
  onPublish: () => void;
}
