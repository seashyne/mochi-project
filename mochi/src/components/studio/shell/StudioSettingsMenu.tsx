// Studio settings popover: appearance, dock visibility and the shortcut sheet.
// Anchored to the title-bar overflow button; closes on outside click or Escape.

import React, { useEffect, useRef } from 'react';
import { Check, Moon, RotateCcw, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/context';
import { useThemeStore, type MochiTheme } from '@/store/useThemeStore';
import type { StudioPanelName } from './ribbonTypes';

export interface StudioSettingsMenuProps {
  onClose: () => void;
  /** Trigger element: clicks on it are handled by the trigger, not treated as outside. */
  anchorRef?: React.RefObject<HTMLElement | null>;
  panels: Record<StudioPanelName, boolean>;
  onTogglePanel: (panel: StudioPanelName) => void;
  onResetPanels: () => void;
}

/** Panel labels match the ribbon captions, so both surfaces read the same. */
const PANEL_LABELS: { id: StudioPanelName; label: string }[] = [
  { id: 'toolbox', label: 'Toolbox' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'properties', label: 'Properties' },
  { id: 'output', label: 'Output' }
];

const SHORTCUTS = [
  'W / E / R',
  'Ctrl + Z',
  'Ctrl + Y',
  'Ctrl + D',
  'Ctrl + G',
  'Del',
  'F',
  'Ctrl + /',
  'Esc'
];

export const StudioSettingsMenu: React.FC<StudioSettingsMenuProps> = ({
  onClose,
  anchorRef,
  panels,
  onTogglePanel,
  onResetPanels
}) => {
  const { t } = useI18n();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Keep the editor's Escape handlers (clear selection, stop play) out of it.
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorRef]);

  const themeButton = (id: MochiTheme, label: string, icon: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => setTheme(id)}
      aria-pressed={theme === id}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-[3px] border text-[11px] transition-colors ${
        theme === id
          ? 'border-studio-accent bg-studio-accent/20 text-studio-text'
          : 'border-studio-border text-studio-muted hover:text-studio-text hover:bg-studio-card/70'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      className="absolute right-1 top-full mt-1 w-64 p-2 rounded-md bg-studio-panel border border-studio-border shadow-xl z-50 space-y-2"
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">
        {t.pages.studioSettings}
      </div>

      <div className="space-y-1">
        <div className="text-[9px] font-mono uppercase tracking-wider text-studio-muted/80">
          {t.pages.appearance}
        </div>
        <div className="flex items-center gap-1">
          {themeButton('dark', t.pages.themeDark, <Moon className="w-3 h-3" />)}
          {themeButton('light', t.pages.themeLight, <Sun className="w-3 h-3" />)}
        </div>
      </div>

      <div className="space-y-1 pt-1 border-t border-studio-border/60">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-wider text-studio-muted/80">
            {t.pages.panelLayout}
          </span>
          <button
            type="button"
            onClick={onResetPanels}
            className="flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t.pages.resetPanels}</span>
          </button>
        </div>
        {PANEL_LABELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => onTogglePanel(panel.id)}
            aria-pressed={panels[panel.id]}
            className="w-full flex items-center gap-2 px-1 py-0.5 rounded-[3px] text-[11px] text-studio-text hover:bg-studio-card/60 transition-colors"
          >
            <span
              className={`w-3 h-3 rounded-[2px] border flex items-center justify-center ${
                panels[panel.id]
                  ? 'border-studio-accent bg-studio-accent/30'
                  : 'border-studio-border bg-studio-bg'
              }`}
            >
              {panels[panel.id] && <Check className="w-2.5 h-2.5 text-studio-text" />}
            </span>
            <span>{panel.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1 pt-1 border-t border-studio-border/60">
        <div className="text-[9px] font-mono uppercase tracking-wider text-studio-muted/80">
          {t.pages.shortcutsTitle}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {SHORTCUTS.map((keys) => (
            <span
              key={keys}
              className="px-1 py-0.5 rounded-[2px] bg-studio-bg border border-studio-border text-[9px] font-mono text-studio-muted text-center truncate"
            >
              {keys}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
