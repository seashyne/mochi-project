// Left Toolbox dock: asset library, part insertion, terrain sculpting, material
// presets, server scripts and model import behind one tab strip.

import React from 'react';
import { Box, Brush, Code2, Layers, Mountain, UploadCloud } from 'lucide-react';
import { StudioAssetLibraryPanel } from '../assets/StudioAssetLibraryPanel';
import { StudioObjectPalette } from '../StudioObjectPalette';
import { StudioTerrainTools } from '../StudioTerrainTools';
import { StudioMaterialLibraryPanel, type MaterialSelection } from '../StudioMaterialLibraryPanel';
import { StudioServerScriptsPanel } from '../StudioServerScriptsPanel';
import { StudioModelImport } from '../StudioModelImport';
import { useUploadedTextures } from '../assets/useUploadedTextures';
import type { ServerManifestController } from '../useServerManifest';
import type { ConstraintKind, TerrainBrush } from '@/engine/studio/advancedTypes';
import type { StudioObject, StudioObjectType } from '@/engine/studio/types';

export type StudioToolboxTab = 'assets' | 'insert' | 'terrain' | 'materials' | 'scripts' | 'import';

export interface StudioToolboxPanelProps {
  tab: StudioToolboxTab;
  onTab: (tab: StudioToolboxTab) => void;
  token: string | null;
  onAddObject: (type: StudioObjectType, preset?: StudioObject) => void;
  brush: TerrainBrush;
  onBrushChange: (patch: Partial<TerrainBrush>) => void;
  isSculpting: boolean;
  onToggleSculpting: () => void;
  onCreateConstraint: (kind: ConstraintKind) => void;
  selectionCount: number;
  serverManifest: ServerManifestController;
  activeTexture?: string | null;
  activeAccessId?: string | null;
  onApplyMaterial: (selection: MaterialSelection) => void;
}

const TABS: { id: StudioToolboxTab; label: string; icon: React.ReactNode }[] = [
  { id: 'assets', label: 'Assets', icon: <Box className="w-3.5 h-3.5" /> },
  { id: 'insert', label: 'Insert', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'terrain', label: 'Terrain', icon: <Mountain className="w-3.5 h-3.5" /> },
  { id: 'materials', label: 'Material', icon: <Brush className="w-3.5 h-3.5" /> },
  { id: 'scripts', label: 'Scripts', icon: <Code2 className="w-3.5 h-3.5" /> },
  { id: 'import', label: 'Import', icon: <UploadCloud className="w-3.5 h-3.5" /> }
];

export const StudioToolboxPanel: React.FC<StudioToolboxPanelProps> = ({
  tab,
  onTab,
  token,
  onAddObject,
  brush,
  onBrushChange,
  isSculpting,
  onToggleSculpting,
  onCreateConstraint,
  selectionCount,
  serverManifest,
  activeTexture,
  activeAccessId,
  onApplyMaterial
}) => {
  const { uploads, hiddenPrivateCount } = useUploadedTextures(token);

  return (
    <div className="flex flex-col min-h-0 h-full bg-studio-panel">
      <div className="flex items-center justify-between px-2 h-6 border-b border-studio-border bg-studio-ribbon shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Toolbox</span>
        <span className="text-[9px] font-mono text-studio-muted">access</span>
      </div>

      <div className="flex items-center gap-0.5 px-1 py-1 border-b border-studio-border/60 shrink-0 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            title={item.label}
            className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-[3px] text-[9px] font-semibold transition-colors ${
              tab === item.id
                ? 'bg-studio-accent/20 text-studio-text border border-studio-accent/50'
                : 'text-studio-muted border border-transparent hover:text-studio-text hover:bg-studio-card/60'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {tab === 'assets' && <StudioAssetLibraryPanel token={token} />}
        {tab === 'insert' && <StudioObjectPalette onAddObject={onAddObject} />}
        {tab === 'terrain' && (
          <StudioTerrainTools
            brush={brush}
            onBrushChange={onBrushChange}
            isSculpting={isSculpting}
            onToggleSculpting={onToggleSculpting}
            onAddTerrain={() => onAddObject('terrain')}
            onAddParticle={() => onAddObject('particle')}
            onCreateConstraint={onCreateConstraint}
            selectionCount={selectionCount}
          />
        )}
        {tab === 'materials' && (
          <StudioMaterialLibraryPanel
            activeTexture={activeTexture}
            activeAccessId={activeAccessId}
            uploads={uploads}
            hiddenPrivateCount={hiddenPrivateCount}
            disabled={selectionCount === 0}
            onApply={onApplyMaterial}
          />
        )}
        {tab === 'scripts' && (
          <StudioServerScriptsPanel
            serverScripts={serverManifest.serverScripts}
            remoteEvents={serverManifest.remoteEvents}
            errors={serverManifest.errors}
            onAddScript={serverManifest.addScript}
            onUpdateScript={serverManifest.updateScript}
            onRemoveScript={serverManifest.removeScript}
            onAddEvent={serverManifest.addEvent}
            onUpdateEvent={serverManifest.updateEvent}
            onRemoveEvent={serverManifest.removeEvent}
            onValidate={serverManifest.validate}
          />
        )}
        {tab === 'import' && (
          <StudioModelImport token={token} onImported={(model) => onAddObject('model', model)} />
        )}
      </div>
    </div>
  );
};
