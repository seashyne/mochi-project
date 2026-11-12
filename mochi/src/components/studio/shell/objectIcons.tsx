// Shared icon mapping for scene objects so the Explorer and the toolbox use the
// same glyph per part type.

import React from 'react';
import {
  Box,
  Circle,
  Coins,
  Cylinder,
  Flame,
  Folder,
  Layers,
  Link2,
  MapPin,
  Mountain,
  Sparkles,
  Triangle,
  Zap
} from 'lucide-react';
import type { StudioObjectType } from '@/engine/studio/types';

export function objectTypeIcon(type: StudioObjectType, className = 'w-3.5 h-3.5'): React.ReactNode {
  switch (type) {
    case 'block':
      return <Box className={`${className} studio-type-block`} />;
    case 'sphere':
      return <Circle className={`${className} studio-type-sphere`} />;
    case 'cylinder':
      return <Cylinder className={`${className} studio-type-cylinder`} />;
    case 'ramp':
      return <Triangle className={`${className} studio-type-ramp`} />;
    case 'platform':
      return <Layers className={`${className} studio-type-platform`} />;
    case 'coin':
      return <Coins className={`${className} studio-type-coin`} />;
    case 'jump_pad':
      return <Zap className={`${className} studio-type-jump`} />;
    case 'hazard':
      return <Flame className={`${className} studio-type-hazard`} />;
    case 'spawn':
      return <MapPin className={`${className} studio-type-spawn`} />;
    case 'model':
      return <Folder className={`${className} studio-type-model`} />;
    case 'terrain':
      return <Mountain className={`${className} studio-type-terrain`} />;
    case 'constraint':
      return <Link2 className={`${className} studio-type-constraint`} />;
    case 'particle':
      return <Sparkles className={`${className} studio-type-particle`} />;
    default:
      return <Box className={`${className} studio-type-block`} />;
  }
}
