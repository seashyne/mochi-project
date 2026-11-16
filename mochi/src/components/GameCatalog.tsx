// Mochi Published 3D Worlds Catalog Browser
// Provides genre category pills, Popular/Newest sorting, instant search with clear reset, and glassmorphic game cards

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Play,
  Users,
  X,
  ArrowUpDown,
  Compass,
  Orbit,
  Zap,
  Sparkles,
  Layers
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { PresenceBadge } from './common/PresenceBadge';

export interface GameCatalogProps {
  games: GameSummary[];
  onPlayGame: (game: GameSummary) => void;
  initialSearch?: string;
}

export type CatalogCategory = 'All' | 'Parkour' | 'Tycoon' | 'Arena' | 'Featured';
export type CatalogSortMode = 'popular' | 'newest';

const CATEGORIES: CatalogCategory[] = ['All', 'Parkour', 'Tycoon', 'Arena', 'Featured'];

function inferCategory(game: GameSummary): Exclude<CatalogCategory, 'All' | 'Featured'> {
  const haystack = `${game.genre || ''} ${game.slug} ${game.title} ${game.description || ''}`.toLowerCase();
  if (haystack.includes('obby') || haystack.includes('parkour')) return 'Parkour';
  if (haystack.includes('tycoon') || haystack.includes('star') || haystack.includes('station')) return 'Tycoon';
  return 'Arena';
}

function matchesCategory(game: GameSummary, category: CatalogCategory): boolean {
  if (category === 'All') return true;
  if (category === 'Featured') {
    return Boolean(game.isFeatured) || game.playCount >= 1000;
  }
  return inferCategory(game) === category;
}

export const GameCatalog: React.FC<GameCatalogProps> = ({ games, onPlayGame, initialSearch = '' }) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory>('All');

  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  const [sortMode, setSortMode] = useState<CatalogSortMode>('popular');

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = games.filter((game) => {
      if (!matchesCategory(game, selectedCategory)) return false;
      if (!q) return true;
      return (
        game.title.toLowerCase().includes(q) ||
        (game.description && game.description.toLowerCase().includes(q)) ||
        game.slug.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (sortMode === 'popular') {
        return b.playCount - a.playCount;
      }
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  }, [games, searchQuery, selectedCategory, sortMode]);

  return (
    <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Top Glassmorphic Discovery Header */}
      <div className="mochi-glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t.catalog.title}
              </h2>
              <PresenceBadge status="online" label={`${filteredGames.length} WORLDS`} size="sm" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">{t.catalog.subtitle}</p>
          </div>

          {/* Search Input with Clear Button + Sort Mode Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.catalog.searchPlaceholder}
                className="mochi-input w-full ps-9 pe-8 py-2 rounded-xl text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t.catalog.clearSearch}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white p-0.5 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative inline-flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#38bdf8] absolute start-3 pointer-events-none" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as CatalogSortMode)}
                aria-label={t.catalog.sortWorlds}
                className="mochi-input ps-8 pe-4 py-2 rounded-xl text-xs font-semibold cursor-pointer appearance-none"
              >
                <option value="popular" className="bg-white dark:bg-[#0e1118] text-slate-900 dark:text-white">
                  {t.catalog.sortPopular}
                </option>
                <option value="newest" className="bg-white dark:bg-[#0e1118] text-slate-900 dark:text-white">
                  {t.catalog.sortNewest}
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Interactive Genre & Featured Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-white/[0.06]">
          {CATEGORIES.map((category) => {
            const isSelected = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all inline-flex items-center gap-1.5 ${
                  isSelected
                    ? 'mochi-btn-primary shadow-mochi-cyan'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                {category === 'Featured' && <Sparkles className="w-3 h-3" />}
                <span>{category}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtered Catalog Grid */}
      {filteredGames.length === 0 ? (
        <div className="mochi-glass-panel rounded-2xl p-12 text-center space-y-3">
          <Layers className="w-9 h-9 text-slate-500 mx-auto" />
          <div className="text-sm font-bold text-slate-900 dark:text-white">No matching 3D worlds found</div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="mochi-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGames.map((game) => {
            const genreLabel = inferCategory(game);
            const ArtIcon =
              genreLabel === 'Parkour' ? Compass : genreLabel === 'Tycoon' ? Orbit : Zap;
            const artGradient =
              genreLabel === 'Parkour'
                ? 'from-[#091f38] via-[#0e1526] to-[#1e1338]'
                : genreLabel === 'Tycoon'
                ? 'from-[#1b1338] via-[#0d1525] to-[#0b272a]'
                : 'from-[#0a242a] via-[#0f1524] to-[#281130]';

            return (
              <div
                key={game.id}
                className="group mochi-card-glow rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Procedural World Banner */}
                  <div
                    onClick={() => onPlayGame(game)}
                    className={`h-40 bg-gradient-to-br ${artGradient} relative overflow-hidden flex items-center justify-center border-b border-white/[0.07] cursor-pointer`}
                  >
                    <div className="absolute inset-0 bg-mochi-grid bg-[size:20px_20px] opacity-60" />
                    <div className="w-28 h-28 rounded-full bg-[#00a2ff]/20 blur-2xl absolute group-hover:scale-125 transition-transform duration-500" />
                    <div className="relative z-10 w-16 h-16 rounded-2xl border border-[#00a2ff]/40 bg-[#00a2ff]/12 flex items-center justify-center text-[#38bdf8] group-hover:scale-110 transition-transform">
                      <ArtIcon className="w-7 h-7" />
                    </div>

                    <span className="absolute top-3 start-3 px-2 py-0.5 rounded-md bg-[#090b10]/80 border border-white/10 text-[10px] font-mono font-bold text-[#38bdf8] uppercase">
                      {genreLabel}
                    </span>

                    <span className="absolute top-3 end-3 px-2 py-0.5 text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-md">
                      {game.currentVersion || 'v1.0.0'}
                    </span>
                  </div>

                  {/* World Metadata */}
                  <div className="p-5 space-y-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#38bdf8] transition-colors truncate">
                      {game.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {game.description || t.catalog.defaultDesc}
                    </p>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="px-5 py-3.5 flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] bg-slate-50/80 dark:bg-[#090b10]/45">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-mono">
                    <Users className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>
                      {game.playCount.toLocaleString()} {t.catalog.plays}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPlayGame(game)}
                    className="mochi-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{t.catalog.playNow}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default GameCatalog;
