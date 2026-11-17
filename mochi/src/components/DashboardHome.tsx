// Mochi authenticated home dashboard: hero spotlight, compact friends strip, and filterable 3D world grids

import React, { useMemo, useState } from 'react';
import { ChevronRight, Compass, Flame, Play, Users, Wrench } from 'lucide-react';
import { FriendsBar, FriendEntry } from './FriendsBar';
import { GameCard3D } from './home/GameCard3D';
import {
  formatCompactCount,
  getCategoryLabel,
  inferWorldCategory,
  resolveGameThumbnail,
  type WorldCategory
} from './home/gameThumbHelpers';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { useSocialStore } from '../store/useSocialStore';
import type { MochiNavTab } from './MochiNavbar';

export interface DashboardHomeProps {
  games: GameSummary[];
  onPlayGame: (game: GameSummary) => void;
  onNavigateTab?: (tab: MochiNavTab) => void;
}

const HOME_FILTERS: WorldCategory[] = ['All', 'Parkour', 'Tycoon', 'Arena'];

function tagFor(game: GameSummary): string {
  const genre = game.genre || inferWorldCategory(game);
  return `${genre.toUpperCase()} // 3D`;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ games, onPlayGame, onNavigateTab }) => {
  const { t } = useI18n();
  const socialFriends = useSocialStore((state) => state.friends);
  const [selectedCategory, setSelectedCategory] = useState<WorldCategory>('All');

  const friendEntries: FriendEntry[] = useMemo(
    () =>
      socialFriends.map((friend) => ({
        id: friend.id,
        name: friend.name,
        presence: friend.presence,
        tier: friend.tier,
        innerGradient: friend.innerGradient,
        statusText:
          friend.presence === 'in_game'
            ? t.dashboard.inGame
            : friend.presence === 'offline'
              ? t.dashboard.offline
              : t.dashboard.online
      })),
    [socialFriends, t]
  );

  const featured = useMemo(
    () => [...games].sort((a, b) => b.playCount - a.playCount).slice(0, 3),
    [games]
  );

  const spotlight = featured[0] ?? null;

  const recommended = useMemo(() => {
    const filtered =
      selectedCategory === 'All'
        ? games
        : games.filter((game) => inferWorldCategory(game) === selectedCategory);
    return filtered.slice(0, 8);
  }, [games, selectedCategory]);

  return (
    <div className="mochi-page mochi-ambient-mesh">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0d12] min-h-[250px] sm:min-h-[288px] flex items-end">
        <img
          src="/landing/hero-valley.jpg"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-[center_35%] block"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(95deg, rgba(6,8,12,0.94) 0%, rgba(6,8,12,0.78) 46%, rgba(6,8,12,0.42) 100%), linear-gradient(0deg, rgba(6,8,12,0.92) 0%, rgba(6,8,12,0.18) 65%)'
          }}
        />
        <div className="relative z-10 w-full p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] gap-6 items-end">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-block px-2.5 py-1 rounded-md bg-[#00a2ff]/20 border border-[#00a2ff]/40 text-[10px] font-mono font-semibold tracking-wider text-[#7ec8ff] uppercase">
              {t.landing.badge}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight whitespace-pre-line">
              {t.landing.heroTitle}
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">{t.landing.heroSub}</p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {spotlight && (
                <button
                  type="button"
                  onClick={() => onPlayGame(spotlight)}
                  className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t.landing.playNow}</span>
                </button>
              )}
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('studio')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold border border-white/15 backdrop-blur-sm transition-colors"
                >
                  <Wrench className="w-4 h-4" />
                  <span>{t.nav.create}</span>
                </button>
              )}
            </div>
          </div>

          {spotlight && (
            <div className="hidden lg:flex items-center gap-3.5 p-3 rounded-2xl bg-[#0b0f17]/80 backdrop-blur-xl border border-white/[0.12] shadow-2xl">
              <img
                src={resolveGameThumbnail(spotlight, 0)}
                alt={spotlight.title}
                decoding="async"
                className="w-28 aspect-[16/10] object-cover rounded-xl shrink-0 border border-white/10"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                  <Flame className="w-3 h-3" />
                  <span>{t.pages.featuredSpotlight}</span>
                </div>
                <div className="text-sm font-extrabold text-white truncate">{spotlight.title}</div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-300">
                    <Users className="w-3 h-3" />
                    <span>{formatCompactCount(spotlight.playCount)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlayGame(spotlight)}
                    className="px-3 py-1 rounded-lg bg-[#00a2ff] hover:bg-[#38bdf8] text-white text-[11px] font-bold transition-colors"
                  >
                    {t.catalog.playNow}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <FriendsBar
        friends={friendEntries}
        onViewAll={onNavigateTab ? () => onNavigateTab('friends') : undefined}
        onAddFriend={onNavigateTab ? () => onNavigateTab('friends') : undefined}
      />

      {games.length === 0 ? (
        <section className="mochi-empty">
          <div className="mochi-icon-badge mx-auto mb-3">
            <Compass className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{t.catalog.title}</h2>
          <p className="mochi-page-sub mx-auto mt-1">{t.catalog.subtitle}</p>
        </section>
      ) : (
        <>
          <section className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="mochi-eyebrow">MOCHI // DISCOVER</div>
                <h2 className="text-base sm:text-lg font-extrabold text-[color:var(--mochi-text)] tracking-tight">
                  {t.dashboard.continuePlaying}
                </h2>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('catalog')}
                  className="mochi-btn-ghost"
                >
                  <span>{t.dashboard.viewAll}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mochi-discover-featured-grid">
              {featured.map((game, index) => (
                <GameCard3D
                  key={game.id}
                  game={game}
                  index={index}
                  tag={tagFor(game)}
                  onPlay={onPlayGame}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-extrabold text-[color:var(--mochi-text)] tracking-tight">
                {t.dashboard.recommendedForYou}
              </h2>
              <div className="mochi-pill-row" role="group" aria-label={t.catalog.title}>
                {HOME_FILTERS.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors border ${
                        isActive
                          ? 'mochi-btn-primary border-transparent'
                          : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]'
                      }`}
                    >
                      {getCategoryLabel(cat, t.pages)}
                    </button>
                  );
                })}
              </div>
            </div>

            {recommended.length === 0 ? (
              <div className="mochi-card-soft py-8 text-center space-y-2">
                <p className="text-xs text-[color:var(--mochi-text-sub)]">{t.pages.noWorldsFound}</p>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="mochi-btn-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold"
                >
                  {t.pages.resetFilters}
                </button>
              </div>
            ) : (
              <div className="mochi-discover-grid">
                {recommended.map((game, index) => (
                  <GameCard3D
                    key={`rec_${game.id}`}
                    game={game}
                    index={index + 1}
                    tag={tagFor(game)}
                    onPlay={onPlayGame}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default DashboardHome;
