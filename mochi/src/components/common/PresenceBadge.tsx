// Reusable Gaming Presence Status Badge Component
// Renders live activity state (online, in_game, studio, offline) with animated pulse ring and optional label

import React from 'react';

export type PresenceStatus = 'online' | 'in_game' | 'studio' | 'offline';

export interface PresenceBadgeProps {
  status: PresenceStatus;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export interface PresenceVisualConfig {
  dotClass: string;
  pingClass: string;
  pillClass: string;
  textClass: string;
  defaultLabel: string;
  isActive: boolean;
}

export const PRESENCE_STATUS_CONFIG: Record<PresenceStatus, PresenceVisualConfig> = {
  online: {
    dotClass: 'bg-[#00a2ff]',
    pingClass: 'bg-[#38bdf8]',
    pillClass: 'bg-[#00a2ff]/12 border-[#00a2ff]/30',
    textClass: 'text-[#38bdf8]',
    defaultLabel: 'Online',
    isActive: true
  },
  in_game: {
    dotClass: 'bg-emerald-400',
    pingClass: 'bg-emerald-300',
    pillClass: 'bg-emerald-500/12 border-emerald-500/30',
    textClass: 'text-emerald-300',
    defaultLabel: 'In Game',
    isActive: true
  },
  studio: {
    dotClass: 'bg-indigo-400',
    pingClass: 'bg-indigo-300',
    pillClass: 'bg-indigo-500/12 border-indigo-500/30',
    textClass: 'text-indigo-300',
    defaultLabel: 'In Studio',
    isActive: true
  },
  offline: {
    dotClass: 'bg-slate-500',
    pingClass: 'bg-slate-500',
    pillClass: 'bg-white/[0.04] border-white/10',
    textClass: 'text-slate-400',
    defaultLabel: 'Offline',
    isActive: false
  }
};

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({
  status,
  label,
  size = 'sm',
  className = ''
}) => {
  const config = PRESENCE_STATUS_CONFIG[status];
  const dotDimensions = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  // Dot-only compact mode when no label is supplied
  if (!label) {
    return (
      <span
        title={config.defaultLabel}
        className={`relative inline-flex items-center justify-center ${dotDimensions} ${className}`}
      >
        {config.isActive && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping ${config.pingClass}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotDimensions} ${config.dotClass}`} />
      </span>
    );
  }

  // Pill badge mode with animated indicator dot and status text
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-medium tracking-wide ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      } ${config.pillClass} ${config.textClass} ${className}`}
    >
      <span className={`relative inline-flex items-center justify-center ${dotDimensions}`}>
        {config.isActive && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping ${config.pingClass}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotDimensions} ${config.dotClass}`} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
};

export default PresenceBadge;
