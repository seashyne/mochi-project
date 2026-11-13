// Shared ribbon data: the part catalog, terrain brushes and gizmo tools used by
// more than one ribbon tab.

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  Brush,
  Circle,
  Coins,
  Cylinder,
  Eraser,
  Flame,
  Layers,
  Link2,
  MapPin,
  Maximize2,
  Minus,
  Mountain,
  Move,
  PersonStanding,
  Plus,
  RotateCw,
  Sparkles,
  Triangle,
  Zap
} from 'lucide-react';
import type { StudioObjectType } from '@/engine/studio/types';
import type { GizmoMode } from '@/engine/studio/transformGizmo';
import type { TerrainTool } from '@/engine/studio/advancedTypes';

export const PART_MENU: { type: StudioObjectType; label: string; icon: React.ReactNode }[] = [
  { type: 'block', label: 'Block', icon: <Box className="w-3.5 h-3.5 studio-type-block" /> },
  { type: 'sphere', label: 'Sphere', icon: <Circle className="w-3.5 h-3.5 studio-type-sphere" /> },
  { type: 'cylinder', label: 'Cylinder', icon: <Cylinder className="w-3.5 h-3.5 studio-type-cylinder" /> },
  { type: 'ramp', label: 'Wedge', icon: <Triangle className="w-3.5 h-3.5 studio-type-ramp" /> },
  { type: 'platform', label: 'Platform', icon: <Layers className="w-3.5 h-3.5 studio-type-platform" /> },
  { type: 'coin', label: 'Coin', icon: <Coins className="w-3.5 h-3.5 studio-type-coin" /> },
  { type: 'jump_pad', label: 'Jump Pad', icon: <Zap className="w-3.5 h-3.5 studio-type-jump" /> },
  { type: 'hazard', label: 'Hazard', icon: <Flame className="w-3.5 h-3.5 studio-type-hazard" /> },
  { type: 'spawn', label: 'Spawn', icon: <MapPin className="w-3.5 h-3.5 studio-type-spawn" /> },
  { type: 'agent', label: 'Agent', icon: <PersonStanding className="w-3.5 h-3.5 studio-type-agent" /> },
  { type: 'terrain', label: 'Terrain', icon: <Mountain className="w-3.5 h-3.5 studio-type-terrain" /> },
  { type: 'constraint', label: 'Joint', icon: <Link2 className="w-3.5 h-3.5 studio-type-constraint" /> },
  { type: 'particle', label: 'Emitter', icon: <Sparkles className="w-3.5 h-3.5 studio-type-particle" /> }
];

export const BRUSHES: { tool: TerrainTool; label: string; icon: React.ReactNode }[] = [
  { tool: 'raise', label: 'Raise', icon: <ArrowUp className="w-4 h-4" /> },
  { tool: 'lower', label: 'Lower', icon: <ArrowDown className="w-4 h-4" /> },
  { tool: 'smooth', label: 'Smooth', icon: <Layers className="w-4 h-4" /> },
  { tool: 'flatten', label: 'Flatten', icon: <Minus className="w-4 h-4" /> },
  { tool: 'paint', label: 'Paint', icon: <Brush className="w-4 h-4" /> },
  { tool: 'erase', label: 'Erase', icon: <Eraser className="w-4 h-4" /> }
];

export const GIZMO_TOOLS: { mode: GizmoMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'translate', label: 'Move', icon: <Move className="w-4 h-4" /> },
  { mode: 'rotate', label: 'Rotate', icon: <RotateCw className="w-4 h-4" /> },
  { mode: 'scale', label: 'Scale', icon: <Maximize2 className="w-4 h-4" /> }
];

export const PartMenuButton: React.FC<{ onAddObject: (type: StudioObjectType) => void }> = ({
  onAddObject
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex flex-col items-center gap-1 w-[58px] py-1.5 rounded-md border border-transparent text-studio-muted hover:text-studio-text hover:bg-studio-card/70 text-[10px] font-semibold leading-none"
        title="Insert a part"
      >
        <Box className="w-5 h-5 text-studio-accent" />
        <span className="flex items-center gap-0.5">
          Part
          <Plus className="w-2.5 h-2.5" />
        </span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-40 py-1 rounded-md bg-studio-panel border border-studio-border shadow-xl z-50"
          onMouseLeave={() => setOpen(false)}
        >
          {PART_MENU.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => {
                onAddObject(item.type);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1 text-[11px] text-studio-text hover:bg-studio-accent/20 transition-colors"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
