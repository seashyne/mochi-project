// 3D Luminous Gaming Card Component
// High-depth perspective artwork, ambient neon bloom, live player telemetry, and interactive hover tilt

import React from 'react';
import { Play, ThumbsUp, Users, Sparkles } from 'lucide-react';
import { GameSummary } from '../../api/types';

export interface GameCard3DProps {
  game: GameSummary;
  tag?: string;
  rating?: string;
  players?: string;
  gradient?: string;
  accentClass?: string;
  icon?: React.ComponentType<{ className?: string }>;
  progressPct?: number;
  onPlay: (game: GameSummary) => void;
}

export const GameCard3D: React.FC<GameCard3DProps> = ({
  game,
  tag = '3D // WORLD',
  rating,
  players,
  gradient = 'from-[#0a1e38] via-[#0e1628] to-[#1f1338]',
  accentClass = 'border-[#00a2ff]/40 text-[#38bdf8] bg-[#00a2ff]/12',
  icon: IconComponent = Sparkles,
  progressPct,
  onPlay
}) => {
  const displayPlayers = players || (game.playCount > 1000 ? `${(game.playCount / 1000).toFixed(1)}K` : `${game.playCount}`);

  return (
    <div
      onClick={() => onPlay(game)}
      className="group relative mochi-card-glow rounded-2xl overflow-hidden cursor-pointer flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 select-none"
    >
      {/* 3D Visual Cover Stage */}
      <div className={`aspect-[16/10] bg-gradient-to-br ${gradient} relative overflow-hidden flex items-center justify-center border-b border-white/[0.08]`}>
        {/* Cyber perspective vanishing grid */}
        <div className="absolute inset-0 bg-mochi-grid bg-[size:18px_18px] opacity-40 group-hover:opacity-65 transition-opacity" />
        
        {/* Ambient neon backdrop glow */}
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-[#00a2ff]/20 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-indigo-500/20 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

        {/* Top Badges: Genre Tag & Live Player Indicator */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-[#090b10]/80 backdrop-blur-md border border-white/10 text-[9px] font-mono font-bold tracking-wider text-slate-300 uppercase shadow-sm">
            {tag}
          </span>
        </div>

        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#090b10]/80 backdrop-blur-md border border-emerald-500/30 text-[9px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{displayPlayers}</span>
        </div>

        {/* Floating 3D Center Artifact */}
        <div className="relative z-10 flex flex-col items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <div className={`w-12 h-12 rounded-2xl border shadow-lg flex items-center justify-center transition-all duration-300 ${accentClass}`}>
            <IconComponent className="w-6 h-6 transition-transform group-hover:rotate-12" />
          </div>
        </div>

        {/* Play Action Hover Shield */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
          <div className="w-12 h-12 rounded-full bg-[#00a2ff] text-white flex items-center justify-center shadow-lg shadow-[#00a2ff]/50 transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Session Progress Bar if applicable */}
        {typeof progressPct === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/[0.08]">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-gradient-to-r from-[#00a2ff] to-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Card Metadata & Telemetry Strip */}
      <div className="p-3.5 space-y-2">
        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-[#38bdf8] truncate transition-colors">
          {game.title}
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
          {game.description || 'โลก 3D อินเทอร์แอคทีฟบนเว็บ'}
        </p>

        <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
          {rating ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <ThumbsUp className="w-3 h-3" />
              <span>{rating}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 uppercase">
              {tag}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
            <Users className="w-3 h-3 text-[#38bdf8]" />
            <span>{displayPlayers}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
