// Mochi Published 3D Worlds Catalog Browser
// Localized category pills, Popular/Newest sorting, instant search with clear reset, and cover-art game cards

import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowUpDown, Layers, Search, Sparkles, X } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { PresenceBadge } from './common/PresenceBadge';
import { GameCard3D } from './home/GameCard3D';
import { getCategoryLabel, inferWorldCategory, type WorldCategory } from './home/gameThumbHelpers';

export interface GameCatalogProps {
  games: GameSummary[];
  onPlayGame: (game: GameSummary) => void;
  initialSearch?: string;
}

export type CatalogCategory = WorldCategory;
export type CatalogSortMode = 'popular' | 'newest';

const CATEGORIES: CatalogCategory[] = ['All', 'Featured', 'Parkour', 'Tycoon', 'Arena'];

function matchesCategory(game: GameSummary, category: CatalogCategory): boolean {
  if (category === 'All') return true;
  if (category === 'Featured') {
    return Boolean(game.isFeatured) || game.playCount >= 1000;
  }
  return inferWorldCategory(game) === category;
}

export const GameCatalog: React.FC<GameCatalogProps> = ({ games, onPlayGame, initialSearch = '' }) => {
  const { t } = useI18n();
  const searchId = useId();
  const sortId = useId();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory>('All');
  const [sortMode, setSortMode] = useState<CatalogSortMode>('popular');

  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

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
    <section className="mochi-page">
      <div className="mochi-glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t.catalog.title}
              </h1>
              <PresenceBadge
                status="online"
                label={`${filteredGames.length} ${t.pages.worldsCountSuffix}`}
                size="sm"
              />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              {t.catalog.subtitle}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <label htmlFor={searchId} className="sr-only">
                {t.catalog.searchPlaceholder}
              </label>
              <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id={searchId}
                type="search"
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
              <label htmlFor={sortId} className="sr-only">
                {t.catalog.sortWorlds}
              </label>
              <ArrowUpDown className="w-3.5 h-3.5 text-[#38bdf8] absolute start-3 pointer-events-none" />
              <select
                id={sortId}
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as CatalogSortMode)}
                aria-label={t.catalog.sortWorlds}
                className="mochi-input ps-8 pe-5 py-2 rounded-xl text-xs font-semibold cursor-pointer appearance-none"
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

        <div
          className="mochi-pill-row pt-3 border-t border-slate-200 dark:border-white/[0.06]"
          role="group"
          aria-label={t.catalog.title}
        >
          {CATEGORIES.map((category) => {
            const isSelected = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedCategory(category)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all inline-flex items-center gap-1.5 ${
                  isSelected
                    ? 'mochi-btn-primary shadow-mochi-cyan'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                {category === 'Featured' && <Sparkles className="w-3 h-3" />}
                <span>{getCategoryLabel(category, t.pages)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredGames.length === 0 ? (
        <div className="mochi-glass-panel rounded-2xl p-12 text-center space-y-3">
          <Layers className="w-9 h-9 text-slate-500 mx-auto" />
          <div className="text-sm font-bold text-slate-900 dark:text-white">{t.pages.noWorldsFound}</div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="mochi-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
          >
            {t.pages.resetFilters}
          </button>
        </div>
      ) : (
        <div className="mochi-discover-grid">
          {filteredGames.map((game, index) => {
            const genreLabel = inferWorldCategory(game);
            return (
              <GameCard3D
                key={game.id}
                game={game}
                index={index}
                tag={`${genreLabel.toUpperCase()} // 3D`}
                onPlay={onPlayGame}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

export default GameCatalog;
