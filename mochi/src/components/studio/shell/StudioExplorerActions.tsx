// Explorer action bar: the insert / group / ungroup / duplicate / delete strip
// above the tree. Kept out of StudioExplorerPanel so both files stay small.

import React from 'react';
import { Copy, FolderPlus, Plus, Trash2, Unlink } from 'lucide-react';
import type { StudioObject, StudioObjectType } from '@/engine/studio/types';

const ACTION =
  'flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono text-studio-muted hover:text-studio-text hover:bg-studio-card/70 transition-colors';

export interface StudioExplorerActionsProps {
  selectedObject: StudioObject | null;
  hasSelection: boolean;
  onAddObject?: (type: StudioObjectType) => void;
  onGroupSelected?: (id: string) => void;
  onUngroupSelected?: (id: string) => void;
  onDuplicateSelection?: () => void;
  onDeleteSelection?: () => void;
}

export const StudioExplorerActions: React.FC<StudioExplorerActionsProps> = ({
  selectedObject,
  hasSelection,
  onAddObject,
  onGroupSelected,
  onUngroupSelected,
  onDuplicateSelection,
  onDeleteSelection
}) => (
  <div className="flex items-center gap-0.5 px-1 py-0.5 border-b border-studio-border/60 shrink-0">
    {onAddObject && (
      <button type="button" onClick={() => onAddObject('block')} title="Insert a part" className={ACTION}>
        <Plus className="w-3 h-3 text-studio-accent" />
        <span>Part</span>
      </button>
    )}
    {onGroupSelected && selectedObject && selectedObject.type !== 'model' && (
      <button
        type="button"
        onClick={() => onGroupSelected(selectedObject.id)}
        title="Group the selection into a Model (Ctrl+G)"
        className={ACTION}
      >
        <FolderPlus className="w-3 h-3 text-studio-info" />
        <span>Group</span>
      </button>
    )}
    {onUngroupSelected && selectedObject?.type === 'model' && (
      <button
        type="button"
        onClick={() => onUngroupSelected(selectedObject.id)}
        title="Ungroup this Model container"
        className={ACTION}
      >
        <Unlink className="w-3 h-3 text-studio-warning" />
        <span>Ungroup</span>
      </button>
    )}
    {onDuplicateSelection && hasSelection && (
      <button
        type="button"
        onClick={onDuplicateSelection}
        title="Duplicate the selected parts (Ctrl+D)"
        className={`${ACTION} ml-auto`}
      >
        <Copy className="w-3 h-3" />
        <span>Duplicate</span>
      </button>
    )}
    {onDeleteSelection && hasSelection && (
      <button
        type="button"
        onClick={onDeleteSelection}
        title="Delete the selected parts"
        className={`${ACTION} ${onDuplicateSelection ? '' : 'ml-auto'} hover:text-studio-danger`}
      >
        <Trash2 className="w-3 h-3" />
        <span>Delete</span>
      </button>
    )}
  </div>
);
