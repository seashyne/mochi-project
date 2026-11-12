// Glassmorphic 3D Player Command Bar & Keybind HUD
// Provides Pause/Resume, Reset Scene, Room Chat Drawer toggle, Fullscreen toggle, and input keybind chips

import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  MessageSquare,
  Keyboard
} from 'lucide-react';

export interface PlayerControlsBarProps {
  title: string;
  description: string;
  isPaused: boolean;
  isFullscreen: boolean;
  isChatOpen: boolean;
  pauseLabel: string;
  resumeLabel: string;
  resetLabel: string;
  onTogglePause: () => void;
  onRestart: () => void;
  onToggleFullscreen: () => void;
  onToggleChat: () => void;
}

const KEYBIND_HINTS: { keyLabel: string; action: string }[] = [
  { keyLabel: 'WASD', action: 'Move' },
  { keyLabel: 'SPACE', action: 'Jump' },
  { keyLabel: 'SHIFT', action: 'Sprint' },
  { keyLabel: 'DRAG', action: 'Orbit' }
];

export const PlayerControlsBar: React.FC<PlayerControlsBarProps> = ({
  title,
  description,
  isPaused,
  isFullscreen,
  isChatOpen,
  pauseLabel,
  resumeLabel,
  resetLabel,
  onTogglePause,
  onRestart,
  onToggleFullscreen,
  onToggleChat
}) => {
  return (
    <div className="mochi-glass-panel rounded-2xl p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Active World Title */}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">{title}</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</p>
        </div>

        {/* Viewport Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePause}
            className="mochi-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
          >
            {isPaused ? (
              <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
            ) : (
              <Pause className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>{isPaused ? resumeLabel : pauseLabel}</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="mochi-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>{resetLabel}</span>
          </button>

          <button
            type="button"
            onClick={onToggleChat}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              isChatOpen ? 'mochi-btn-primary' : 'mochi-btn-secondary'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Room Chat</span>
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="mochi-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-[#38bdf8]" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-[#38bdf8]" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Windowed' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Compact Keybind HUD Strip */}
      <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-200 dark:border-white/[0.06]">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 mr-1">
          <Keyboard className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>CONTROLS</span>
        </span>
        {KEYBIND_HINTS.map((item) => (
          <div
            key={item.keyLabel}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/10 text-[10px] font-mono"
          >
            <span className="font-bold text-[#00a2ff] dark:text-[#38bdf8]">{item.keyLabel}</span>
            <span className="text-slate-600 dark:text-slate-400">{item.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayerControlsBar;
