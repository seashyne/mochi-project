// Studio editor shell: title bar, ribbon, docked toolbox / viewport / explorer +
// properties, output console and status bar. Every region is a slot so the page
// above decides what each tab shows without touching the chrome.

import React from 'react';
import { StudioMenuBar, type StudioMenuActions } from './StudioMenuBar';
import {
  StudioRibbon,
  type StudioPanelName,
  type StudioRibbonActions,
  type StudioRibbonTab
} from './StudioRibbon';
import { StudioStatusBar, type StudioStatusBarProps } from './StudioStatusBar';

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
}) => (
  <div className="h-full w-full flex flex-col overflow-hidden bg-studio-bg text-studio-text font-sans select-none">
    <StudioMenuBar
      documentName={documentName}
      isDirty={isDirty}
      actions={menuActions}
      teamAccessory={teamAccessory}
      onCollaborate={onCollaborate}
    />
    <StudioRibbon activeTab={ribbonTab} onTab={onRibbonTab} actions={ribbonActions} />

    <div className="flex-1 flex min-h-0">
      {panels.toolbox && toolbox && (
        <aside className="w-[266px] shrink-0 min-h-0 border-e border-studio-border">{toolbox}</aside>
      )}

      <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-studio-bg">{viewport}</main>

      {(panels.explorer || panels.properties) && (
        <aside className="w-[292px] shrink-0 min-h-0 flex flex-col border-s border-studio-border">
          {panels.explorer && (
            <div className="h-[42%] min-h-0 border-b border-studio-border">{explorer}</div>
          )}
          {panels.properties && <div className="flex-1 min-h-0">{properties}</div>}
        </aside>
      )}
    </div>

    {panels.output && output}

    <StudioStatusBar {...status} />
  </div>
);
