// One row of the Explorer tree: icon, name (or inline rename), child count,
// hover actions and the right-click hook.

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import type { StudioObject } from '@/engine/studio/types';
import { objectTypeIcon } from './objectIcons';

export interface ExplorerRowActions {
  onSelect: (id: string, additive: boolean) => void;
  onToggleCollapse: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent) => void;
  onStartRename: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Reparents the dragged part under `parentId` (null = Workspace root). */
  onReparent?: (id: string, parentId: string | null) => void;
  renamingId: string | null;
  draftName: string;
  onDraftName: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

export interface StudioExplorerRowProps {
  object: StudioObject;
  depth: number;
  childCount: number;
  isSelected: boolean;
  isCollapsed: boolean;
  actions: ExplorerRowActions;
}

const rowBase =
  'group flex items-center gap-1.5 h-[22px] pr-2 rounded-[3px] cursor-pointer text-[11px] transition-colors';

export const StudioExplorerRow: React.FC<StudioExplorerRowProps> = ({
  object,
  depth,
  childCount,
  isSelected,
  isCollapsed,
  actions
}) => {
  const renaming = actions.renamingId === object.id;
  const hasChildren = childCount > 0;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragKey = 'text/part-id';

  return (
    <div
      onClick={(event) => actions.onSelect(object.id, event.ctrlKey || event.metaKey || event.shiftKey)}
      onContextMenu={(event) => actions.onContextMenu(object.id, event)}
      onDoubleClick={() => actions.onStartRename(object.id)}
      draggable={Boolean(actions.onReparent) && !renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(dragKey, object.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (!actions.onReparent) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        if (!actions.onReparent) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDropTarget(false);
        const draggedId = event.dataTransfer.getData(dragKey);
        if (draggedId && draggedId !== object.id) actions.onReparent(draggedId, object.id);
      }}
      data-part-id={object.id}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      className={`${rowBase} ${
        isSelected
          ? 'bg-studio-accent/25 text-studio-text border-l-2 border-studio-accent'
          : 'text-studio-text/85 hover:bg-studio-card/60 border-l-2 border-transparent'
      } ${isDropTarget ? 'ring-1 ring-inset ring-studio-accent bg-studio-accent/10' : ''}`}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            actions.onToggleCollapse(object.id);
          }}
          className="text-studio-muted hover:text-studio-text"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-3" />
      )}
      {objectTypeIcon(object.type, 'w-3.5 h-3.5 shrink-0')}

      {renaming ? (
        <input
          autoFocus
          value={actions.draftName}
          onChange={(event) => actions.onDraftName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.stopPropagation()}
          onBlur={actions.onCommitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') actions.onCommitRename();
            if (event.key === 'Escape') {
              event.stopPropagation();
              actions.onCancelRename();
            }
          }}
          aria-label={`Rename ${object.name}`}
          className="min-w-0 flex-1 px-1 py-[1px] rounded-[2px] bg-studio-bg border border-studio-accent text-[11px] text-studio-text focus:outline-none"
        />
      ) : (
        <span className="truncate">{object.name}</span>
      )}

      {hasChildren && (
        <span className="ml-auto text-[9px] font-mono text-studio-muted">{childCount}</span>
      )}
      <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 ${hasChildren ? '' : 'ml-auto'}`}>
        {actions.onDuplicate && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actions.onDuplicate?.(object.id);
            }}
            title={`Duplicate ${object.name}`}
            aria-label={`Duplicate ${object.name}`}
            className="p-0.5 rounded text-studio-muted hover:text-studio-accent hover:bg-studio-card/80 transition-colors"
          >
            <Copy className="w-3 h-3" />
          </button>
        )}
        {actions.onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actions.onDelete?.(object.id);
            }}
            title={`Delete ${object.name}`}
            aria-label={`Delete ${object.name}`}
            className="p-0.5 rounded text-studio-muted hover:text-studio-danger hover:bg-studio-card/80 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: object.color }} />
    </div>
  );
};
