// Explorer context menu: the per-row actions a scene editor puts behind a right
// click. Positioned at the cursor and closed by the parent on any selection.

import React, { useEffect, useRef } from 'react';
import { ClipboardPaste, Copy, Crosshair, FolderPlus, PencilLine, Scissors, Trash2, Unlink } from 'lucide-react';
import type { StudioObject } from '@/engine/studio/types';

export interface StudioExplorerContextMenuProps {
  object: StudioObject;
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
  onClose: () => void;
  onRename: (id: string) => void;
  onCut?: (id: string) => void;
  onCopy?: (id: string) => void;
  onPaste?: () => void;
  canPaste?: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
  onGroup?: (id: string) => void;
  onUngroup?: (id: string) => void;
}

const ITEM =
  'w-full flex items-center gap-2 px-2 py-1 rounded-[3px] text-[11px] text-studio-text hover:bg-studio-accent/20 transition-colors';

export const StudioExplorerContextMenu: React.FC<StudioExplorerContextMenuProps> = ({
  object,
  x,
  y,
  onClose,
  onRename,
  onCut,
  onCopy,
  onPaste,
  canPaste = false,
  onDuplicate,
  onDelete,
  onFocus,
  onGroup,
  onUngroup
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={`Actions for ${object.name}`}
      style={{ left: x, top: y }}
      className="fixed z-50 w-44 py-1 rounded-md bg-studio-panel border border-studio-border shadow-xl"
    >
      <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-studio-muted truncate">
        {object.name}
      </div>
      <button type="button" className={ITEM} onClick={run(() => onRename(object.id))}>
        <PencilLine className="w-3 h-3 text-studio-muted" />
        <span>Rename</span>
        <span className="ml-auto font-mono text-[9px] text-studio-muted">F2</span>
      </button>
      {onCut && (
        <button type="button" className={ITEM} onClick={run(() => onCut(object.id))}>
          <Scissors className="w-3 h-3 text-studio-muted" />
          <span>Cut</span>
          <span className="ml-auto font-mono text-[9px] text-studio-muted">Ctrl+X</span>
        </button>
      )}
      {onCopy && (
        <button type="button" className={ITEM} onClick={run(() => onCopy(object.id))}>
          <Copy className="w-3 h-3 text-studio-muted" />
          <span>Copy</span>
          <span className="ml-auto font-mono text-[9px] text-studio-muted">Ctrl+C</span>
        </button>
      )}
      {onPaste && (
        <button
          type="button"
          disabled={!canPaste}
          onClick={run(onPaste)}
          className={`${ITEM} disabled:opacity-35 disabled:hover:bg-transparent`}
        >
          <ClipboardPaste className="w-3 h-3 text-studio-muted" />
          <span>Paste</span>
          <span className="ml-auto font-mono text-[9px] text-studio-muted">Ctrl+V</span>
        </button>
      )}
      <button type="button" className={ITEM} onClick={run(() => onDuplicate(object.id))}>
        <Copy className="w-3 h-3 text-studio-muted" />
        <span>Duplicate</span>
        <span className="ml-auto font-mono text-[9px] text-studio-muted">Ctrl+D</span>
      </button>
      <button type="button" className={ITEM} onClick={run(() => onFocus(object.id))}>
        <Crosshair className="w-3 h-3 text-studio-muted" />
        <span>Focus</span>
        <span className="ml-auto font-mono text-[9px] text-studio-muted">F</span>
      </button>
      {onGroup && object.type !== 'model' && (
        <button type="button" className={ITEM} onClick={run(() => onGroup(object.id))}>
          <FolderPlus className="w-3 h-3 text-studio-info" />
          <span>Group into model</span>
        </button>
      )}
      {onUngroup && object.type === 'model' && (
        <button type="button" className={ITEM} onClick={run(() => onUngroup(object.id))}>
          <Unlink className="w-3 h-3 text-studio-warning" />
          <span>Ungroup</span>
        </button>
      )}
      <div className="my-1 h-px bg-studio-border" />
      <button type="button" className={`${ITEM} hover:text-studio-danger`} onClick={run(() => onDelete(object.id))}>
        <Trash2 className="w-3 h-3" />
        <span>Delete</span>
        <span className="ml-auto font-mono text-[9px] text-studio-muted">Del</span>
      </button>
    </div>
  );
};
