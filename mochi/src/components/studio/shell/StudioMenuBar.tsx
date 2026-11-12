// Studio title bar: document name, the File/Edit/View/Test menus, and the
// collaborate cluster on the right. Dropdown state is local so the shell above
// stays free of menu bookkeeping.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, HelpCircle, Share2, Box } from 'lucide-react';
import { StudioSettingsMenu } from './StudioSettingsMenu';

export interface StudioMenuActions {
  onNewProject?: () => void;
  onSave?: () => void;
  onPublish?: () => void;
  onExit?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  hasSelection?: boolean;
  panels?: Record<'toolbox' | 'explorer' | 'properties' | 'output', boolean>;
  onTogglePanel?: (panel: 'toolbox' | 'explorer' | 'properties' | 'output') => void;
  onPlaytest?: () => void;
  onRunScript?: () => void;
  onFocusSelection?: () => void;
  onResetPanels?: () => void;
}

export interface StudioMenuBarProps {
  documentName: string;
  isDirty?: boolean;
  actions: StudioMenuActions;
  teamAccessory?: React.ReactNode;
  onCollaborate?: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
  checked?: boolean;
}

function buildMenus(actions: StudioMenuActions): { label: string; items: MenuItem[] }[] {
  const panels = actions.panels;
  return [
    {
      label: 'File',
      items: [
        { label: 'New Project', shortcut: 'Ctrl+N', onSelect: actions.onNewProject },
        { label: 'Save Draft', shortcut: 'Ctrl+S', onSelect: actions.onSave },
        { label: 'Publish Release...', onSelect: actions.onPublish },
        { label: '', separator: true },
        { label: 'Close Project', onSelect: actions.onExit }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !actions.canUndo, onSelect: actions.onUndo },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !actions.canRedo, onSelect: actions.onRedo },
        { label: '', separator: true },
        { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !actions.hasSelection, onSelect: actions.onDuplicate },
        { label: 'Delete', shortcut: 'Del', disabled: !actions.hasSelection, onSelect: actions.onDelete },
        { label: 'Select All', shortcut: 'Ctrl+A', onSelect: actions.onSelectAll }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Toolbox', disabled: !panels, checked: panels?.toolbox, onSelect: () => actions.onTogglePanel?.('toolbox') },
        { label: 'Explorer', disabled: !panels, checked: panels?.explorer, onSelect: () => actions.onTogglePanel?.('explorer') },
        { label: 'Properties', disabled: !panels, checked: panels?.properties, onSelect: () => actions.onTogglePanel?.('properties') },
        { label: 'Output', disabled: !panels, checked: panels?.output, onSelect: () => actions.onTogglePanel?.('output') },
        { label: '', separator: true },
        { label: 'Focus Selection', shortcut: 'F', disabled: !actions.hasSelection, onSelect: actions.onFocusSelection }
      ]
    },
    {
      label: 'Test',
      items: [
        { label: 'Playtest Scene', shortcut: 'F5', onSelect: actions.onPlaytest },
        { label: 'Run Lua Script', onSelect: actions.onRunScript }
      ]
    }
  ];
}

export const StudioMenuBar: React.FC<StudioMenuBarProps> = ({
  documentName,
  isDirty = false,
  actions,
  teamAccessory,
  onCollaborate
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const settingsTriggerRef = useRef<HTMLSpanElement | null>(null);
  const menus = buildMenus(actions);

  useEffect(() => {
    if (!openMenu) return undefined;
    const handlePointer = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openMenu]);

  return (
    <div
      ref={barRef}
      className="relative z-40 flex items-center justify-between gap-3 h-8 px-2 bg-studio-ribbon border-b border-studio-border shrink-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 pl-1 pr-2">
          <span className="w-4 h-4 rounded-[3px] bg-studio-accent flex items-center justify-center">
            <Box className="w-2.5 h-2.5 text-studio-on-accent" />
          </span>
          <span className="text-[11px] font-bold text-studio-text whitespace-nowrap">
            {documentName}
            {isDirty ? ' *' : ''}
          </span>
          <span className="text-[11px] text-studio-muted whitespace-nowrap hidden sm:inline">
            - Mochi Studio
          </span>
        </div>

        <nav className="flex items-center">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((prev) => (prev === menu.label ? null : menu.label))}
                className={`px-2 py-1 rounded text-[11px] transition-colors ${
                  openMenu === menu.label
                    ? 'bg-studio-card text-studio-text'
                    : 'text-studio-muted hover:text-studio-text hover:bg-studio-card/60'
                }`}
              >
                {menu.label}
              </button>
              {openMenu === menu.label && (
                <div className="absolute left-0 top-full mt-0.5 w-52 py-1 rounded-md bg-studio-panel border border-studio-border shadow-xl">
                  {menu.items.map((item, index) =>
                    item.separator ? (
                      <div key={`sep-${index}`} className="my-1 h-px bg-studio-border" />
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                          item.onSelect?.();
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center justify-between gap-3 px-2.5 py-1 text-[11px] text-studio-text hover:bg-studio-accent/20 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 text-studio-accent">{item.checked ? 'v' : ''}</span>
                          <span>{item.label}</span>
                        </span>
                        {item.shortcut && (
                          <span className="font-mono text-[10px] text-studio-muted">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {teamAccessory}
        {onCollaborate && (
          <button
            type="button"
            onClick={onCollaborate}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-studio-accent/15 border border-studio-accent/40 text-studio-accent text-[11px] font-semibold hover:bg-studio-accent/25 transition-colors"
          >
            <Share2 className="w-3 h-3" />
            <span>Collaborate</span>
          </button>
        )}
        <span ref={settingsTriggerRef} className="flex items-center gap-1">
          <button
            type="button"
            title="Studio settings and shortcuts"
            aria-label="Studio settings"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-card transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Studio settings"
            aria-label="More"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-card transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
      {settingsOpen && actions.onResetPanels && (
        <StudioSettingsMenu
          onClose={() => setSettingsOpen(false)}
          anchorRef={settingsTriggerRef}
          panels={actions.panels ?? { toolbox: true, explorer: true, properties: true, output: true }}
          onTogglePanel={(panel) => actions.onTogglePanel?.(panel)}
          onResetPanels={actions.onResetPanels}
        />
      )}
    </div>
  );
};
