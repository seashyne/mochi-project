// Explorer dock: the project service tree with the scene objects nested under
// Workspace, a search filter, an action bar and a right-click menu.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { StudioObject, StudioObjectType } from '@/engine/studio/types';
import {
  childServices,
  topLevelServices,
  type StudioServiceId
} from '@/engine/studio/services';
import { StudioExplorerActions } from './StudioExplorerActions';
import { StudioExplorerRow, type ExplorerRowActions } from './StudioExplorerRow';
import { StudioExplorerServiceRow } from './StudioExplorerServiceRow';
import { StudioExplorerContextMenu } from './StudioExplorerContextMenu';

export interface StudioExplorerPanelProps {
  objects: StudioObject[];
  selectedId: string | null;
  selectedIds: string[];
  selectedService: StudioServiceId | null;
  onSelectObject: (id: string) => void;
  onToggleObjectSelect?: (id: string) => void;
  onSelectService: (id: StudioServiceId) => void;
  onAddObject?: (type: StudioObjectType) => void;
  onDeleteObject?: (id: string) => void;
  onDeleteSelection?: () => void;
  onDuplicateObject?: (id: string) => void;
  onDuplicateSelection?: () => void;
  onGroupSelected?: (id: string) => void;
  onUngroupSelected?: (id: string) => void;
  onRenameObject?: (id: string, name: string) => void;
  onFocusObject?: (id: string) => void;
  onCutObject?: (id: string) => void;
  onCopyObject?: (id: string) => void;
  onPasteObjects?: () => void;
  clipboardCount?: number;
  onReparent?: (id: string, parentId: string | null) => void;
}

const rowBase =
  'group flex items-center gap-1.5 h-[22px] pr-2 rounded-[3px] cursor-pointer text-[11px] transition-colors';

/** True when `candidate` sits below `ancestor` in the parent chain. */
export function isDescendant(objects: StudioObject[], candidate: string, ancestor: string): boolean {
  let current = objects.find((object) => object.id === candidate);
  while (current?.parentId) {
    if (current.parentId === ancestor) return true;
    const parentId = current.parentId;
    current = objects.find((object) => object.id === parentId);
  }
  return false;
}

export const StudioExplorerPanel: React.FC<StudioExplorerPanelProps> = ({
  objects,
  selectedId,
  selectedIds,
  selectedService,
  onSelectObject,
  onToggleObjectSelect,
  onSelectService,
  onAddObject,
  onDeleteObject,
  onDeleteSelection,
  onDuplicateObject,
  onDuplicateSelection,
  onGroupSelected,
  onUngroupSelected,
  onRenameObject,
  onFocusObject,
  onCutObject,
  onCopyObject,
  onPasteObjects,
  clipboardCount = 0,
  onReparent
}) => {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;
  const hasSelection = selectedIds.length > 0;

  const childrenMap = useMemo(() => {
    const map = new Map<string, StudioObject[]>();
    objects.forEach((obj) => {
      if (!obj.parentId) return;
      const list = map.get(obj.parentId) ?? [];
      list.push(obj);
      map.set(obj.parentId, list);
    });
    return map;
  }, [objects]);

  const rootObjects = useMemo(() => objects.filter((obj) => !obj.parentId), [objects]);

  const matches = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const startRename = (id: string) => {
    const target = objects.find((object) => object.id === id);
    if (!target || !onRenameObject) return;
    setRenamingId(id);
    setDraftName(target.name);
  };

  const commitRename = () => {
    if (renamingId && onRenameObject) {
      const trimmed = draftName.trim();
      const current = objects.find((object) => object.id === renamingId);
      if (trimmed && trimmed !== current?.name) onRenameObject(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  // F2 renames the selected part, the way every scene editor does it.
  const renameRef = useRef(startRename);
  renameRef.current = startRename;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key !== 'F2' || !selectedId) return;
      event.preventDefault();
      renameRef.current(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const reparent = (id: string, parentId: string | null) => {
    if (!onReparent || id === parentId) return;
    // Dropping a part into its own descendant would build a cycle.
    if (parentId && isDescendant(objects, parentId, id)) return;
    onReparent(id, parentId);
  };

  const actions: ExplorerRowActions = {
    onSelect: (id, additive) => (additive && onToggleObjectSelect ? onToggleObjectSelect(id) : onSelectObject(id)),
    onToggleCollapse: toggle,
    onContextMenu: (id, event) => {
      event.preventDefault();
      onSelectObject(id);
      setMenu({ id, x: event.clientX, y: event.clientY });
    },
    onStartRename: startRename,
    onDuplicate: onDuplicateObject,
    onDelete: onDeleteObject,
    onReparent: onReparent ? reparent : undefined,
    renamingId,
    draftName,
    onDraftName: setDraftName,
    onCommitRename: commitRename,
    onCancelRename: () => setRenamingId(null)
  };

  const renderObject = (obj: StudioObject, depth: number): React.ReactNode => {
    if (!matches(obj.name)) return null;
    const children = childrenMap.get(obj.id) ?? [];
    const isCollapsed = Boolean(collapsed[obj.id]);
    const isSelected = selectedIds.length > 0 ? selectedIds.includes(obj.id) : obj.id === selectedId;
    return (
      <React.Fragment key={obj.id}>
        <StudioExplorerRow
          object={obj}
          depth={depth}
          childCount={children.length}
          isSelected={isSelected}
          isCollapsed={isCollapsed}
          actions={actions}
        />
        {children.length > 0 && !isCollapsed && children.map((child) => renderObject(child, depth + 1))}
      </React.Fragment>
    );
  };

  const renderService = (id: StudioServiceId, depth: number): React.ReactNode => {
    const service = topLevelServices().find((node) => node.id === id) ??
      childServices('lighting').find((node) => node.id === id);
    if (!service) return null;
    const nested = childServices(service.id);
    const holdsObjects = service.id === 'workspace';
    const isCollapsed = Boolean(collapsed[service.id]);

    return (
      <React.Fragment key={service.id}>
        <StudioExplorerServiceRow
          serviceId={service.id}
          name={service.name}
          iconKey={service.icon}
          depth={depth}
          expandable={nested.length > 0 || holdsObjects}
          isCollapsed={isCollapsed}
          isSelected={selectedService === service.id}
          objectCount={holdsObjects ? rootObjects.length : nested.length}
          rowClass={rowBase}
          onSelect={() => onSelectService(service.id)}
          onToggleCollapse={() => toggle(service.id)}
          onDropPart={holdsObjects && onReparent ? (partId) => reparent(partId, null) : undefined}
        />
        {!isCollapsed && holdsObjects && rootObjects.map((obj) => renderObject(obj, depth + 1))}
        {!isCollapsed && nested.map((child) => renderService(child.id, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col min-h-0 h-full bg-studio-panel">
      <div className="flex items-center justify-between px-2 h-6 border-b border-studio-border bg-studio-ribbon shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Explorer</span>
        <span className="text-[9px] font-mono text-studio-muted">{objects.length} parts</span>
      </div>
      <StudioExplorerActions
        selectedObject={selectedObject}
        hasSelection={hasSelection}
        onAddObject={onAddObject}
        onGroupSelected={onGroupSelected}
        onUngroupSelected={onUngroupSelected}
        onDuplicateSelection={onDuplicateSelection}
        onDeleteSelection={onDeleteSelection}
      />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-studio-border/60 shrink-0">
        <Search className="w-3 h-3 text-studio-muted shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-[11px] text-studio-text placeholder:text-studio-muted/70 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {topLevelServices().map((service) => renderService(service.id, 0))}
      </div>
      {menu && (() => {
        const target = objects.find((object) => object.id === menu.id);
        if (!target) return null;
        return (
          <StudioExplorerContextMenu
            object={target}
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onRename={startRename}
            onCut={onCutObject}
            onCopy={onCopyObject}
            onPaste={onPasteObjects}
            canPaste={clipboardCount > 0}
            onDuplicate={(id) => onDuplicateObject?.(id)}
            onDelete={(id) => onDeleteObject?.(id)}
            onFocus={(id) => onFocusObject?.(id)}
            onGroup={onGroupSelected}
            onUngroup={onUngroupSelected}
          />
        );
      })()}
    </div>
  );
};
