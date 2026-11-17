// Luminous 3D Gaming Card Component
// Semantic <article> card with 16:10 3D cover artwork, container queries, live telemetry, and accessible card trigger

import React from 'react';
import { Play, ThumbsUp, Users, Sparkles } from 'lucide-react';
import { GameSummary } from '../../api/types';
import { useI18n } from '../../i18n/context';
import { formatCompactCount, resolveGameThumbnail } from './gameThumbHelpers';

export interface GameCard3DProps {
  game: GameSummary;
  index?: number;
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
  index = 0,
  tag = '3D // WORLD',
  rating,
  players,
  progressPct,
  onPlay
}) => {
  const { t } = useI18n();
  const displayPlayers = players || formatCompactCount(game.playCount);
  const coverSrc = resolveGameThumbnail(game, index);

  return (
    <article className="mochi-game-card group select-none">
      <div className="mochi-game-card-media">
        <img
          src={coverSrc}
          alt={game.title}
          loading="lazy"
          decoding="async"
          className="mochi-game-card-img"
        />
        <div className="mochi-game-card-scrim" />

        <div className="absolute top-2.5 start-2.5 z-10 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-[#090b10]/80 backdrop-blur-md border border-white/15 text-[10px] font-mono font-bold tracking-wider text-slate-100 uppercase">
            {tag}
          </span>
          {game.isFeatured && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-[10px] font-bold text-amber-200">
              <Sparkles className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        <div className="absolute top-2.5 end-2.5 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#090b10]/80 backdrop-blur-md border border-emerald-500/35 text-[10px] font-mono font-semibold text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{displayPlayers}</span>
        </div>

        <div className="absolute bottom-2.5 end-2.5 z-10 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00a2ff] text-white text-xs font-bold shadow-lg shadow-[#00a2ff]/40">
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{t.catalog.playNow}</span>
          </span>
        </div>

        {typeof progressPct === 'number' && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-gradient-to-r from-[#00a2ff] to-indigo-500"
            />
          </div>
        )}
      </div>

      <div className="mochi-game-card-body">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-[15px] leading-snug truncate">
            <button
              type="button"
              onClick={() => onPlay(game)}
              className="mochi-game-card-trigger truncate transition-colors"
            >
              {game.title}
            </button>
          </h3>
          <p className="mochi-game-desc">
            {game.description || t.catalog.defaultDesc}
          </p>
        </div>

        <footer className="mochi-game-card-footer font-mono">
          {rating ? (
            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
              <ThumbsUp className="w-3 h-3" />
              <span>{rating}</span>
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-white/[0.06] text-[10px] font-semibold text-[color:var(--mochi-text-sub)]">
              {game.currentVersion || 'v1.0.0'}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-[color:var(--mochi-text-sub)] font-semibold">
            <Users className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>
              {displayPlayers} {t.catalog.plays}
            </span>
          </span>
        </footer>
      </div>
    </article>
  );
};

export default GameCard3D;
