// Terrain sculpt brush, constraint creation and emitter insertion controls.

import React from 'react';
import { Mountain, Brush, Link2, Sparkles, ArrowUp, ArrowDown, Minus, Eraser, Layers } from 'lucide-react';
import {
  CONSTRAINT_KINDS,
  ConstraintKind,
  TERRAIN_MATERIALS,
  TERRAIN_TOOLS,
  TerrainBrush,
  TerrainMaterialId,
  TerrainTool
} from '../../engine/studio/advancedTypes';

export interface StudioTerrainToolsProps {
  brush: TerrainBrush;
  onBrushChange: (patch: Partial<TerrainBrush>) => void;
  isSculpting: boolean;
  onToggleSculpting: () => void;
  onAddTerrain: () => void;
  onAddParticle: () => void;
  onCreateConstraint: (kind: ConstraintKind) => void;
  selectionCount: number;
}

const TOOL_LABELS: Record<TerrainTool, string> = {
  raise: 'Raise',
  lower: 'Lower',
  smooth: 'Smooth',
  flatten: 'Flatten',
  paint: 'Paint',
  erase: 'Erase'
};

const TOOL_ICONS: Record<TerrainTool, React.ReactNode> = {
  raise: <ArrowUp className="w-3 h-3" />,
  lower: <ArrowDown className="w-3 h-3" />,
  smooth: <Layers className="w-3 h-3" />,
  flatten: <Minus className="w-3 h-3" />,
  paint: <Brush className="w-3 h-3" />,
  erase: <Eraser className="w-3 h-3" />
};

const inputClass = 'w-full px-2 py-1 text-[11px] rounded-lg bg-studio-bg border border-studio-border text-studio-text focus:outline-none focus:border-studio-accent';
const labelClass = 'text-[10px] font-mono text-studio-muted uppercase font-bold';

export const StudioTerrainTools: React.FC<StudioTerrainToolsProps> = ({
  brush,
  onBrushChange,
  isSculpting,
  onToggleSculpting,
  onAddTerrain,
  onAddParticle,
  onCreateConstraint,
  selectionCount
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-studio-panel border border-studio-border text-studio-text space-y-3">
      <div className="flex items-center justify-between pb-1.5 border-b border-studio-border">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-studio-muted font-bold">
          <Mountain className="w-3.5 h-3.5 studio-type-terrain" />
          <span>Terrain & Physics</span>
        </div>
        <button
          type="button"
          onClick={onToggleSculpting}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
            isSculpting
              ? 'bg-studio-success/20 border-studio-success/50 text-studio-success'
              : 'bg-studio-card border-studio-border text-studio-muted hover:text-studio-text'
          }`}
        >
          {isSculpting ? 'Brush ON' : 'Brush OFF'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {TERRAIN_TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onBrushChange({ tool })}
            className={`py-1.5 rounded-lg border text-[10px] font-mono flex items-center justify-center gap-1 transition-all ${
              brush.tool === tool
                ? 'bg-studio-accent/20 border-studio-accent/50 text-studio-text font-bold'
                : 'bg-studio-card border-studio-border text-studio-muted hover:text-studio-text'
            }`}
          >
            {TOOL_ICONS[tool]}
            <span>{TOOL_LABELS[tool]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={labelClass}>Radius ({brush.radius})</span>
          <input
            type="range" min="1" max="16" step="1" value={brush.radius}
            onChange={(e) => onBrushChange({ radius: Number(e.target.value) })}
            className="w-full accent-studio-accent"
          />
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Strength ({brush.strength})</span>
          <input
            type="range" min="1" max="8" step="1" value={brush.strength}
            onChange={(e) => onBrushChange({ strength: Number(e.target.value) })}
            className="w-full accent-studio-accent"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={labelClass}>Material</span>
          <select
            value={brush.material}
            onChange={(e) => onBrushChange({ material: e.target.value as TerrainMaterialId })}
            className={inputClass}
          >
            {TERRAIN_MATERIALS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Flatten To</span>
          <input
            type="number" min="0" max="32" step="1" value={brush.flattenHeight}
            onChange={(e) => onBrushChange({ flattenHeight: Number(e.target.value) })}
            className={inputClass}
          />
        </label>
      </div>

      <div className="pt-2 border-t border-studio-border space-y-2">
        <div className="flex gap-1.5">
          <button
            type="button" onClick={onAddTerrain}
            className="flex-1 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[10px] font-mono text-studio-text hover:bg-studio-bg flex items-center justify-center gap-1"
          >
            <Mountain className="w-3 h-3 studio-type-terrain" /> Terrain
          </button>
          <button
            type="button" onClick={onAddParticle}
            className="flex-1 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[10px] font-mono text-studio-text hover:bg-studio-bg flex items-center justify-center gap-1"
          >
            <Sparkles className="w-3 h-3 studio-type-particle" /> Emitter
          </button>
        </div>
        <div className="space-y-1">
          <span className={labelClass}>Joint (needs 2 selected parts)</span>
          <div className="grid grid-cols-5 gap-1">
            {CONSTRAINT_KINDS.map((kind: ConstraintKind) => (
              <button
                key={kind}
                type="button"
                disabled={selectionCount < 2}
                onClick={() => onCreateConstraint(kind)}
                title={`Create ${kind} joint`}
                className="py-1 rounded-lg bg-studio-card border border-studio-border text-[9px] font-mono text-studio-violet hover:border-studio-violet/60 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-0.5"
              >
                <Link2 className="w-2.5 h-2.5" />
                <span className="truncate">{kind}</span>
              </button>
            ))}
          </div>
          {selectionCount < 2 && (
            <p className="text-[9px] font-mono text-studio-muted">Select two parts in the hierarchy first.</p>
          )}
        </div>
      </div>
    </div>
  );
};
