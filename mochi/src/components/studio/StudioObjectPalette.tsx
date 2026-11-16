// Shelf of placeable 3D primitive objects and gameplay components for Studio World Builder

import React from 'react';
import { Box, Layers, Coins, Zap, Flame, MapPin, PersonStanding, Plus, Circle, Cylinder, Triangle, Mountain, Link2, Sparkles } from 'lucide-react';
import { StudioObjectType, OBJECT_TYPE_DEFAULTS } from '../../engine/studio/types';

export interface StudioObjectPaletteProps {
  onAddObject: (type: StudioObjectType) => void;
}

const PALETTE_ITEMS: { type: StudioObjectType; icon: React.ReactNode; desc: string }[] = [
  { type: 'block', icon: <Box className="w-4 h-4 studio-type-block" />, desc: 'Solid terrain block' },
  { type: 'sphere', icon: <Circle className="w-4 h-4 studio-type-sphere" />, desc: 'Round solid part' },
  { type: 'cylinder', icon: <Cylinder className="w-4 h-4 studio-type-cylinder" />, desc: 'Upright pillar or tower' },
  { type: 'ramp', icon: <Triangle className="w-4 h-4 studio-type-ramp" />, desc: 'Sloped walkway (rises +X)' },
  { type: 'platform', icon: <Layers className="w-4 h-4 studio-type-platform" />, desc: 'Floating kinematic ledge' },
  { type: 'coin', icon: <Coins className="w-4 h-4 studio-type-coin" />, desc: 'Rotating score pickup' },
  { type: 'jump_pad', icon: <Zap className="w-4 h-4 studio-type-jump" />, desc: 'Vertical velocity booster' },
  { type: 'hazard', icon: <Flame className="w-4 h-4 studio-type-hazard" />, desc: 'Lava respawn trigger' },
  { type: 'spawn', icon: <MapPin className="w-4 h-4 studio-type-spawn" />, desc: 'Initial player origin' },
  { type: 'agent', icon: <PersonStanding className="w-4 h-4 studio-type-agent" />, desc: 'NPC walker driven by agent.moveTo' },
  { type: 'terrain', icon: <Mountain className="w-4 h-4 studio-type-terrain" />, desc: 'Sculptable voxel terrain' },
  { type: 'constraint', icon: <Link2 className="w-4 h-4 studio-type-constraint" />, desc: 'Joint between two parts' },
  { type: 'particle', icon: <Sparkles className="w-4 h-4 studio-type-particle" />, desc: 'Point particle emitter' }
];

export const StudioObjectPalette: React.FC<StudioObjectPaletteProps> = ({ onAddObject }) => {
  return (
    <div className="p-3.5 rounded-xl bg-studio-panel border border-studio-border text-studio-text space-y-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-studio-border">
        <span className="text-[11px] font-mono uppercase tracking-wider text-studio-muted font-bold">
          3D Object Palette
        </span>
        <span className="text-[10px] font-mono text-studio-muted">{`${PALETTE_ITEMS.length} Components`}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PALETTE_ITEMS.map((item) => {
          const config = OBJECT_TYPE_DEFAULTS[item.type];
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onAddObject(item.type)}
              className="group p-2.5 rounded-xl bg-studio-card hover:bg-studio-card/80 border border-studio-border hover:border-studio-accent/50 text-studio-text transition-all text-start flex flex-col justify-between space-y-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="p-1.5 rounded-lg bg-studio-bg border border-studio-border/50 group-hover:scale-105 transition-transform">
                  {item.icon}
                </div>
                <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent transition-colors" />
              </div>
              <div>
                <div className="text-xs font-bold text-studio-text group-hover:text-studio-accent transition-colors truncate">
                  {config.label}
                </div>
                <div className="text-[10px] text-studio-muted truncate">{item.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
