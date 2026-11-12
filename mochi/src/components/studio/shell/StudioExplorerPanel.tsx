// Explorer dock: the project service tree with the scene objects nested under
// Workspace and the sky/atmosphere instances nested under Lighting.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Beaker,
  Box,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudFog,
  Database,
  Folder,
  Gamepad2,
  LayoutGrid,
  Music,
  Package,
  Palette,
  Search,
  Server,
  Sun,
  Users
} from 'lucide-react';
import type { StudioObject, StudioObjectType } from '@/engine/studio/types';
import {
  childServices,
  topLevelServices,
  type ServiceIconKey,
  type StudioServiceId
} from '@/engine/studio/services';
import { StudioExplorerActions } from './StudioExplorerActions';
import { StudioExplorerRow, type ExplorerRowActions } from './StudioExplorerRow';
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
}

const SERVICE_ICONS: Record<ServiceIconKey, { icon: React.ReactNode; className: string }> = {
  workspace: { icon: <Box className="w-3.5 h-3.5" />, className: 'text-studio-accent' },
  players: { icon: <Users className="w-3.5 h-3.5" />, className: 'text-studio-info' },
  lighting: { icon: <Sun className="w-3.5 h-3.5" />, className: 'text-studio-warning' },
  sky: { icon: <Cloud className="w-3.5 h-3.5" />, className: 'text-studio-info' },
  atmosphere: { icon: <CloudFog className="w-3.5 h-3.5" />, className: 'text-studio-muted' },
  material: { icon: <Palette className="w-3.5 h-3.5" />, className: 'text-studio-violet' },
  folder: { icon: <Folder className="w-3.5 h-3.5" />, className: 'text-studio-muted' },
  database: { icon: <Database className="w-3.5 h-3.5" />, className: 'text-studio-info' },
  server: { icon: <Server className="w-3.5 h-3.5" />, className: 'text-studio-success' },
  gui: { icon: <LayoutGrid className="w-3.5 h-3.5" />, className: 'text-studio-violet' },
  backpack: { icon: <Package className="w-3.5 h-3.5" />, className: 'text-studio-warning' },
  player: { icon: <Gamepad2 className="w-3.5 h-3.5" />, className: 'text-studio-info' },
  sound: { icon: <Music className="w-3.5 h-3.5" />, className: 'text-studio-violet' },
  test: { icon: <Beaker className="w-3.5 h-3.5" />, className: 'text-studio-muted' }
};

const rowBase =
  'group flex items-center gap-1.5 h-[22px] pr-2 rounded-[3px] cursor-pointer text-[11px] transition-colors';

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
  onFocusObject
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

  const rootObjects = useMemo(
    () => objects.filter((obj) => !obj.parentId),
    [objects]
  );

  const matches = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const actions: ExplorerRowActions = {
    onSelect: (id, additive) => (additive && onToggleObjectSelect ? onToggleObjectSelect(id) : onSelectObject(id)),
    onToggleCollapse: (id) => toggle(id),
    onContextMenu: (id, event) => {
      event.preventDefault();
      onSelectObject(id);
      setMenu({ id, x: event.clientX, y: event.clientY });
    },
    onStartRename: startRename,
    onDuplicate: onDuplicateObject,
    onDelete: onDeleteObject,
    renamingId,
    draftName,
    onDraftName: setDraftName,
    onCommitRename: commitRename,
    onCancelRename: () => setRenamingId(null)
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
    const expandable = nested.length > 0 || holdsObjects;
    const isCollapsed = Boolean(collapsed[service.id]);
    const isSelected = selectedService === service.id;
    const icon = SERVICE_ICONS[service.icon];
    const objectCount = holdsObjects ? rootObjects.length : nested.length;

    return (
      <React.Fragment key={service.id}>
        <div
          onClick={() => onSelectService(service.id)}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
          className={`${rowBase} ${
            isSelected
              ? 'bg-studio-accent/25 text-studio-text border-l-2 border-studio-accent'
              : 'text-studio-text/85 hover:bg-studio-card/60 border-l-2 border-transparent'
          }`}
        >
          {expandable ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggle(service.id);
              }}
              className="text-studio-muted hover:text-studio-text"
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className={icon.className}>{icon.icon}</span>
          <span className="truncate">{service.name}</span>
          {objectCount > 0 && (
            <span className="ml-auto text-[9px] font-mono text-studio-muted">{objectCount}</span>
          )}
        </div>
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
