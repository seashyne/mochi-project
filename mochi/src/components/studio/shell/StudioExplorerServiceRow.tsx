// Explorer service row: one node of the project tree (Workspace, Lighting, Sky,
// ...). Doubles as the drop target that moves a part back to the Workspace root.

import React, { useState } from 'react';
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
  Server,
  Sun,
  Users
} from 'lucide-react';
import type { ServiceIconKey } from '@/engine/studio/services';

export const SERVICE_ICONS: Record<ServiceIconKey, { icon: React.ReactNode; className: string }> = {
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

export interface StudioExplorerServiceRowProps {
  serviceId: string;
  name: string;
  iconKey: ServiceIconKey;
  depth: number;
  expandable: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  objectCount: number;
  rowClass: string;
  onSelect: () => void;
  onToggleCollapse: () => void;
  /** Dropping a part on Workspace moves it back to the root. */
  onDropPart?: (partId: string) => void;
}

export const StudioExplorerServiceRow: React.FC<StudioExplorerServiceRowProps> = ({
  serviceId,
  name,
  iconKey,
  depth,
  expandable,
  isCollapsed,
  isSelected,
  objectCount,
  rowClass,
  onSelect,
  onToggleCollapse,
  onDropPart
}) => {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const icon = SERVICE_ICONS[iconKey];

  return (
    <div
      onClick={onSelect}
      data-service-id={serviceId}
      onDragOver={(event) => {
        if (!onDropPart) return;
        event.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        if (!onDropPart) return;
        event.preventDefault();
        setIsDropTarget(false);
        const partId = event.dataTransfer.getData('text/part-id');
        if (partId) onDropPart(partId);
      }}
      style={{ paddingLeft: `${6 + depth * 12}px` }}
      className={`${rowClass} ${
        isSelected
          ? 'bg-studio-accent/25 text-studio-text border-l-2 border-studio-accent'
          : 'text-studio-text/85 hover:bg-studio-card/60 border-l-2 border-transparent'
      } ${isDropTarget ? 'ring-1 ring-inset ring-studio-accent bg-studio-accent/10' : ''}`}
    >
      {expandable ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse();
          }}
          className="text-studio-muted hover:text-studio-text"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-3" />
      )}
      <span className={icon.className}>{icon.icon}</span>
      <span className="truncate">{name}</span>
      {objectCount > 0 && (
        <span className="ml-auto text-[9px] font-mono text-studio-muted">{objectCount}</span>
      )}
    </div>
  );
};
