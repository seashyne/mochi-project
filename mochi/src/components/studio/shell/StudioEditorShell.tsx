// Studio editor shell: title bar, ribbon, dockable workspace layout, and status bar.
// Slots allow host pages to supply tool components without chrome coupling.

import React, { useMemo } from 'react';
import { StudioMenuBar, type StudioMenuActions } from './StudioMenuBar';
import {
  StudioRibbon,
  type StudioPanelName,
  type StudioRibbonActions,
  type StudioRibbonTab
} from './StudioRibbon';
import { StudioStatusBar, type StudioStatusBarProps } from './StudioStatusBar';
import { StudioDockContainer } from '../layout/StudioDockContainer';
import type { StudioPanelSlots } from '../layout/layoutTypes';

export interface StudioEditorShellProps {
  documentName: string;
  isDirty: boolean;
  panels: Record<StudioPanelName, boolean>;
  ribbonTab: StudioRibbonTab;
  onRibbonTab: (tab: StudioRibbonTab) => void;
  ribbonActions: StudioRibbonActions;
  menuActions: StudioMenuActions;
  teamAccessory?: React.ReactNode;
  onCollaborate?: () => void;
  toolbox?: React.ReactNode;
  viewport: React.ReactNode;
  explorer?: React.ReactNode;
  properties?: React.ReactNode;
  output?: React.ReactNode;
  status: StudioStatusBarProps;
}

export const StudioEditorShell: React.FC<StudioEditorShellProps> = ({
  documentName,
  isDirty,
  panels,
  ribbonTab,
  onRibbonTab,
  ribbonActions,
  menuActions,
  teamAccessory,
  onCollaborate,
  toolbox,
  viewport,
  explorer,
  properties,
  output,
  status
}) => {
  const slots = useMemo<StudioPanelSlots>(
    () => ({
      toolbox,
      viewport,
      explorer,
      properties,
      output
    }),
    [toolbox, viewport, explorer, properties, output]
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-studio-bg text-studio-text font-sans select-none">
      <StudioMenuBar
        documentName={documentName}
        isDirty={isDirty}
        actions={menuActions}
        teamAccessory={teamAccessory}
        onCollaborate={onCollaborate}
      />
      <StudioRibbon activeTab={ribbonTab} onTab={onRibbonTab} actions={ribbonActions} />

      <StudioDockContainer slots={slots} panels={panels} />

      <StudioStatusBar {...status} />
    </div>
  );
};
