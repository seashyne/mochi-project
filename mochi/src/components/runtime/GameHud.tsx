// In-session HUD driven by runtime game state: live scores, leaderboard and toasts.
// Shared by Studio playtest and published games — every value comes from a Lua write.

import React, { useSyncExternalStore } from 'react';
import { Coins, Trophy, Gamepad2 } from 'lucide-react';
import { GameState } from '../../engine/runtime';

export interface GameHudProps {
  state: GameState;
  hint?: string;
}

export const GameHud: React.FC<GameHudProps> = ({ state, hint = 'WASD move · Space jump · Drag to orbit' }) => {
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  const scores = Object.entries(snapshot.scores);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 max-w-[60%]">
          {scores.map(([category, value]) => (
            <div
              key={category}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090b10]/85 border border-white/10 backdrop-blur-md shadow-lg"
            >
              {category.toLowerCase().includes('coin') ? (
                <Coins className="w-3.5 h-3.5 text-[#fbbf24]" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
              )}
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{category}</span>
              <span className="text-xs font-extrabold text-white tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        {snapshot.leaderboard.length > 0 && (
          <div className="min-w-[150px] rounded-lg bg-[#090b10]/85 border border-white/10 backdrop-blur-md shadow-lg overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-white/[0.08] flex items-center gap-1.5">
              <Trophy className="w-3 h-3 text-[#fbbf24]" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Leaderboard</span>
            </div>
            <ul className="px-2.5 py-1.5 space-y-1">
              {snapshot.leaderboard.map((row, index) => (
                <li key={row.category} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-slate-400 truncate">
                    <span className="text-slate-500 me-1 tabular-nums">{index + 1}.</span>
                    {row.category}
                  </span>
                  <span className="font-bold text-[#38bdf8] tabular-nums">{row.score}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-col items-center gap-1.5">
          {snapshot.notifications.map((toast) => (
            <div
              key={toast.id}
              className="px-3 py-1.5 rounded-lg bg-[#0b1220]/95 border border-[#38bdf8]/40 text-xs font-semibold text-[#e0f2fe] shadow-[0_0_24px_-6px_rgba(56,189,248,0.6)] animate-in fade-in slide-in-from-bottom-2"
            >
              {toast.message}
            </div>
          ))}
        </div>
        {hint && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090b10]/70 border border-white/[0.07] text-[10px] font-mono text-slate-500">
            <Gamepad2 className="w-3 h-3" />
            <span>{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
};
