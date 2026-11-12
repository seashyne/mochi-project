// Wires the editor shell to the document: ribbon + menu actions, the docked
// toolbox / explorer / properties panels, the output console and the status bar.

import React from 'react';
import type { EnvironmentState } from '@/engine/environment/environmentTypes';
import { getStudioService, type StudioServiceId } from '@/engine/studio/services';
import type { GizmoMode } from '@/engine/studio/transformGizmo';
import type { ConstraintKind, TerrainBrush } from '@/engine/studio/advancedTypes';
import type { StudioDocumentApi } from '../useStudioDocument';
import type { ServerManifestController } from '../useServerManifest';
import type { MaterialSelection } from '../StudioMaterialLibraryPanel';
import { StudioEditorShell } from './StudioEditorShell';
import { StudioToolboxPanel, type StudioToolboxTab } from './StudioToolboxPanel';
import { StudioExplorerPanel } from './StudioExplorerPanel';
import { StudioPropertiesPanel } from './StudioPropertiesPanel';
import { StudioOutputPanel, type StudioOutputFilter } from './StudioOutputPanel';
import type { StudioLogEntry } from './useStudioSystemLog';
import type { StudioPanelName, StudioRibbonActions, StudioRibbonTab } from './ribbonTypes';
import type { StudioMenuActions } from './StudioMenuBar';

export interface StudioShellProps {
  title: string;
  isDirty: boolean;
  lastSavedAt: string | null;
  isSaving: boolean;
  doc: StudioDocumentApi;
  environment: EnvironmentState;
  onEnvironmentChange: (patch: Partial<EnvironmentState>) => void;
  onEnvironmentReset: () => void;
  serverManifest: ServerManifestController;
  token: string | null;
  logs: StudioLogEntry[];
  onClearLogs: () => void;
  outputFilter: StudioOutputFilter;
  onOutputFilter: (filter: StudioOutputFilter) => void;
  outputCollapsed: boolean;
  onToggleOutputCollapse: () => void;
  panels: Record<StudioPanelName, boolean>;
  onTogglePanel: (panel: StudioPanelName) => void;
  ribbonTab: StudioRibbonTab;
  onRibbonTab: (tab: StudioRibbonTab) => void;
  toolboxTab: StudioToolboxTab;
  onToolboxTab: (tab: StudioToolboxTab) => void;
  onOpenToolboxTab: (tab: string) => void;
  gizmoMode: GizmoMode;
  onGizmoMode: (mode: GizmoMode) => void;
  snapping: boolean;
  onToggleSnap: () => void;
  brush: TerrainBrush;
  onBrushChange: (patch: Partial<TerrainBrush>) => void;
  isSculpting: boolean;
  onToggleSculpting: () => void;
  selectedService: StudioServiceId | null;
  onSelectService: (id: StudioServiceId) => void;
  onSelectObject: (id: string) => void;
  onToggleObjectSelect: (id: string) => void;
  onCreateConstraint: (kind: ConstraintKind) => void;
  onSave: () => void;
  onPlaytest: () => void;
  onPublish: () => void;
  onRunScript: () => void;
  onCommand: (command: string) => void;
  onResetPanels: () => void;
  onFocusSelection: () => void;
  onExit?: () => void;
  teamAccessory?: React.ReactNode;
  viewport: React.ReactNode;
  clockLabel: string;
  skyLabel: string;
}

export const StudioShell: React.FC<StudioShellProps> = (props) => {
  const {
    title, isDirty, lastSavedAt, isSaving, doc, environment, onEnvironmentChange,
    onEnvironmentReset, serverManifest, token, logs, onClearLogs, outputFilter,
    onOutputFilter, outputCollapsed, onToggleOutputCollapse, panels, onTogglePanel,
    ribbonTab, onRibbonTab, toolboxTab, onToolboxTab, onOpenToolboxTab, gizmoMode,
    onGizmoMode, snapping, onToggleSnap, brush, onBrushChange, isSculpting,
    onToggleSculpting, selectedService, onSelectService, onSelectObject,
    onToggleObjectSelect, onCreateConstraint, onSave, onPlaytest, onPublish,
    onRunScript, onCommand, onResetPanels, onFocusSelection, onExit, teamAccessory, viewport,
    clockLabel, skyLabel
  } = props;

  const { selectedObject, selectedId, selectedIds, objects } = doc;
  const hasSelection = selectedIds.length > 0;

  const applyMaterial = (selection: MaterialSelection) => {
    if (!selectedId) return;
    doc.updateObject(selectedId, {
      materialTexture: selection.presetId ?? null,
      textureAccessId: selection.accessId ?? null,
      textureUrl: selection.url ?? null
    });
  };

  const ribbonActions: StudioRibbonActions = {
    gizmoMode,
    onGizmoMode,
    snapping,
    onToggleSnap,
    onAddObject: doc.addObject,
    hasSelection,
    isAnchored: selectedObject ? selectedObject.anchored !== false : true,
    onToggleAnchor: () => selectedId && doc.toggleAnchor(selectedId),
    onDuplicate: () => doc.duplicateObjects(selectedIds),
    onDelete: () => doc.deleteObjects(selectedIds),
    onGroup: () => selectedId && doc.groupSelected(selectedId),
    onUngroup: () => selectedId && doc.ungroupSelected(selectedId),
    canUndo: doc.canUndo,
    canRedo: doc.canRedo,
    onUndo: doc.undo,
    onRedo: doc.redo,
    panels,
    onTogglePanel,
    onOpenToolboxTab,
    onPlaytest,
    onSave,
    isSaving,
    brush,
    onBrushChange,
    isSculpting,
    onToggleSculpting,
    onRunScript,
    onPublish
  };

  const menuActions: StudioMenuActions = {
    onNewProject: onExit,
    onSave,
    onPublish,
    onExit,
    canUndo: doc.canUndo,
    canRedo: doc.canRedo,
    onUndo: doc.undo,
    onRedo: doc.redo,
    onDuplicate: () => doc.duplicateObjects(selectedIds),
    onDelete: () => doc.deleteObjects(selectedIds),
    onSelectAll: doc.selectAll,
    hasSelection,
    panels,
    onTogglePanel,
    onPlaytest,
    onRunScript,
    onFocusSelection,
    onResetPanels
  };

  return (
    <StudioEditorShell
      documentName={title}
      isDirty={isDirty}
      panels={panels}
      ribbonTab={ribbonTab}
      onRibbonTab={onRibbonTab}
      ribbonActions={ribbonActions}
      menuActions={menuActions}
      teamAccessory={teamAccessory}
      toolbox={
        <StudioToolboxPanel
          tab={toolboxTab}
          onTab={onToolboxTab}
          token={token}
          onAddObject={doc.addObject}
          brush={brush}
          onBrushChange={onBrushChange}
          isSculpting={isSculpting}
          onToggleSculpting={onToggleSculpting}
          onCreateConstraint={onCreateConstraint}
          selectionCount={selectedIds.length}
          serverManifest={serverManifest}
          activeTexture={selectedObject?.materialTexture}
          activeAccessId={selectedObject?.textureAccessId}
          onApplyMaterial={applyMaterial}
        />
      }
      viewport={viewport}
      explorer={
        <StudioExplorerPanel
          objects={objects}
          selectedId={selectedId}
          selectedIds={selectedIds}
          selectedService={selectedService}
          onSelectObject={onSelectObject}
          onToggleObjectSelect={onToggleObjectSelect}
          onSelectService={onSelectService}
          onAddObject={doc.addObject}
          onDeleteObject={(id) => doc.deleteObjects([id])}
          onDeleteSelection={() => doc.deleteObjects(selectedIds)}
          onDuplicateObject={(id) => doc.duplicateObjects([id])}
          onDuplicateSelection={() => doc.duplicateObjects(selectedIds)}
          onGroupSelected={doc.groupSelected}
          onUngroupSelected={doc.ungroupSelected}
        />
      }
      properties={
        <StudioPropertiesPanel
          selectedObject={selectedObject}
          selectedService={selectedService}
          selectedCount={selectedIds.length}
          objects={objects}
          environment={environment}
          onEnvironmentChange={onEnvironmentChange}
          onEnvironmentReset={onEnvironmentReset}
          onUpdateObject={doc.updateObject}
        />
      }
      output={
        <div className={`flex flex-col min-h-0 ${outputCollapsed ? '' : 'h-[132px]'}`}>
          <StudioOutputPanel
            logs={logs}
            filter={outputFilter}
            onFilter={onOutputFilter}
            onClear={onClearLogs}
            collapsed={outputCollapsed}
            onToggleCollapse={onToggleOutputCollapse}
          />
        </div>
      }
      status={{
        partCount: objects.length,
        selectionLabel: selectedObject
          ? selectedObject.name
          : selectedService
            ? getStudioService(selectedService)?.name ?? null
            : null,
        clockLabel,
        skyLabel,
        isDirty,
        lastSavedAt,
        onCommand
      }}
    />
  );
};
