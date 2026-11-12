// Hook providing creator shortcuts: Undo (Ctrl+Z), Redo (Ctrl+Y), Select All (Ctrl+A),
// Duplicate (Ctrl+D), Delete (Del/Backspace), Group (Ctrl+G), Anchor (Alt+A)

import { useEffect } from 'react';

export interface StudioShortcutsOptions {
  enabled?: boolean;
  selectedId: string | null;
  selectedIds?: string[];
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  onGroup?: (id: string) => void;
  onToggleAnchor?: (id: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onCopy?: (ids: string[]) => void;
  onCut?: (ids: string[]) => void;
  onPaste?: () => void;
  onFocus?: () => void;
}

export function useStudioShortcuts({
  enabled = true,
  selectedId,
  selectedIds,
  onDuplicate,
  onDelete,
  onGroup,
  onToggleAnchor,
  onUndo,
  onRedo,
  onSelectAll,
  onCopy,
  onCut,
  onPaste,
  onFocus
}: StudioShortcutsOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ids = selectedIds && selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];

      if (isCtrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
      } else if (isCtrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        onRedo?.();
      } else if (isCtrl && key === 'a') {
        e.preventDefault();
        onSelectAll?.();
      } else if (isCtrl && key === 'c') {
        e.preventDefault();
        if (ids.length > 0) onCopy?.(ids);
      } else if (isCtrl && key === 'x') {
        e.preventDefault();
        if (ids.length > 0) onCut?.(ids);
      } else if (isCtrl && key === 'v') {
        e.preventDefault();
        onPaste?.();
      } else if (!isCtrl && !e.altKey && key === 'f') {
        e.preventDefault();
        onFocus?.();
      } else if (isCtrl && key === 'd') {
        e.preventDefault();
        if (ids.length > 0 && onDuplicate) {
          onDuplicate(ids);
        }
      } else if (isCtrl && key === 'g') {
        e.preventDefault();
        if (selectedId && onGroup) {
          onGroup(selectedId);
        }
      } else if (e.altKey && key === 'a') {
        e.preventDefault();
        if (selectedId && onToggleAnchor) {
          onToggleAnchor(selectedId);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.length > 0 && onDelete) {
          e.preventDefault();
          onDelete(ids);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    selectedId,
    selectedIds,
    onDuplicate,
    onDelete,
    onGroup,
    onToggleAnchor,
    onUndo,
    onRedo,
    onSelectAll,
    onCopy,
    onCut,
    onPaste,
    onFocus
  ]);
}
