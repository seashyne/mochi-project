// Reusable Tiered Gaming Avatar Frame Component
// Renders rank-styled metallic or holographic borders (bronze, silver, gold, cyber) with optional presence overlay

import React from 'react';
import { Gamepad2, Code2 } from 'lucide-react';
import { PresenceStatus, PRESENCE_STATUS_CONFIG } from './PresenceBadge';

export type AvatarFrameTier = 'bronze' | 'silver' | 'gold' | 'cyber';
export type AvatarFrameSize = 'sm' | 'md' | 'lg';

export interface AvatarFrameProps {
  initials: string;
  tier?: AvatarFrameTier;
  size?: AvatarFrameSize;
  status?: PresenceStatus;
  statusTitle?: string;
  shape?: 'circle' | 'rounded';
  innerGradient?: string;
  className?: string;
}

export const AVATAR_TIER_STYLES: Record<AvatarFrameTier, { ring: string; glow: string }> = {
  bronze: {
    ring: 'from-amber-700 via-orange-400 to-amber-800',
    glow: 'shadow-[0_0_14px_-4px_rgba(217,119,6,0.45)]'
  },
  silver: {
    ring: 'from-slate-400 via-slate-100 to-slate-500',
    glow: 'shadow-[0_0_16px_-4px_rgba(226,232,240,0.38)]'
  },
  gold: {
    ring: 'from-amber-300 via-yellow-500 to-orange-500',
    glow: 'shadow-[0_0_18px_-3px_rgba(245,158,11,0.55)]'
  },
  cyber: {
    ring: 'from-[#00a2ff] via-sky-300 to-indigo-500',
    glow: 'shadow-[0_0_20px_-3px_rgba(0,162,255,0.55)]'
  }
};

const SIZE_CLASSES: Record<
  AvatarFrameSize,
  { outer: string; text: string; badge: string; icon: string; pad: string }
> = {
  sm: {
    outer: 'w-9 h-9',
    text: 'text-xs',
    badge: 'w-3.5 h-3.5 -bottom-0.5 -end-0.5 border-[1.5px]',
    icon: 'w-2 h-2',
    pad: 'p-[1.5px]'
  },
  md: {
    outer: 'w-14 h-14',
    text: 'text-sm',
    badge: 'w-4 h-4 bottom-0 end-0 border-2',
    icon: 'w-2.5 h-2.5',
    pad: 'p-[2px]'
  },
  lg: {
    outer: 'w-16 h-16',
    text: 'text-xl',
    badge: 'w-5 h-5 -bottom-0.5 -end-0.5 border-2',
    icon: 'w-3 h-3',
    pad: 'p-[2px]'
  }
};

export const AvatarFrame: React.FC<AvatarFrameProps> = ({
  initials,
  tier = 'cyber',
  size = 'md',
  status,
  statusTitle,
  shape = 'circle',
  innerGradient = 'from-[#161b26] via-[#111622] to-[#090b10]',
  className = ''
}) => {
  const tierConfig = AVATAR_TIER_STYLES[tier];
  const sizeConfig = SIZE_CLASSES[size];
  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';
  const innerRadiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-[14px]';
  const cleanInitials = (initials.trim().slice(0, 2) || 'M').toUpperCase();

  const presenceConfig = status ? PRESENCE_STATUS_CONFIG[status] : null;

  return (
    <div className={`relative inline-flex shrink-0 select-none ${className}`}>
      <div
        className={`mochi-avatar-frame ${sizeConfig.outer} ${sizeConfig.pad} ${radiusClass} bg-gradient-to-tr ${tierConfig.ring} ${tierConfig.glow} transition-transform duration-200`}
      >
        <div
          className={`w-full h-full ${innerRadiusClass} bg-gradient-to-b ${innerGradient} flex items-center justify-center font-extrabold tracking-tight text-white border border-white/10 ${sizeConfig.text}`}
        >
          {cleanInitials}
        </div>
      </div>

      {status && presenceConfig && (
        <div
          title={statusTitle || presenceConfig.defaultLabel}
          className={`absolute ${sizeConfig.badge} rounded-full border-[#090b10] flex items-center justify-center text-white shadow-md ${presenceConfig.dotClass}`}
        >
          {status === 'in_game' && <Gamepad2 className={sizeConfig.icon} />}
          {status === 'studio' && <Code2 className={sizeConfig.icon} />}
        </div>
      )}
    </div>
  );
};

export default AvatarFrame;
