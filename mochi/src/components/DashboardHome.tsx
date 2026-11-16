// Mochi authenticated home dashboard using the real published catalogue

import React, { useMemo } from 'react';
import { ChevronRight, Shield, Compass, Layers, Orbit, Cpu, Zap, Play, Wrench } from 'lucide-react';
import { FriendsBar, FriendEntry } from './FriendsBar';
import { GameCard3D } from './home/GameCard3D';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { useSocialStore } from '../store/useSocialStore';
import type { MochiNavTab } from './MochiNavbar';

export interface DashboardHomeProps {
  games: GameSummary[];
  onPlayGame: (game: GameSummary) => void;
  onNavigateTab?: (tab: MochiNavTab) => void;
}

const CARD_THEMES = [
  { gradient: 'from-[#0a1f3b] via-[#0e1424] to-[#1d1338]', accentClass: 'text-[#38bdf8] border-[#00a2ff]/40 bg-[#00a2ff]/12', Icon: Shield },
  { gradient: 'from-[#072634] via-[#0b1626] to-[#0c292b]', accentClass: 'text-cyan-300 border-cyan-400/40 bg-cyan-500/12', Icon: Compass },
  { gradient: 'from-[#082822] via-[#0d1622] to-[#14261c]', accentClass: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/12', Icon: Layers },
  { gradient: 'from-[#221238] via-[#111425] to-[#2b1029]', accentClass: 'text-indigo-300 border-indigo-400/40 bg-indigo-500/12', Icon: Orbit },
  { gradient: 'from-[#2c1d0c] via-[#131520] to-[#261414]', accentClass: 'text-amber-300 border-amber-400/40 bg-amber-500/12', Icon: Cpu },
  { gradient: 'from-[#0b2336] via-[#121428] to-[#261132]', accentClass: 'text-sky-300 border-sky-400/40 bg-sky-500/12', Icon: Zap }
];

function tagFor(game: GameSummary): string {
  const genre = game.genre || game.slug.split(/[-_]/)[0] || 'world';
  return `${genre.toUpperCase()} // 3D`;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ games, onPlayGame, onNavigateTab }) => {
  const { t } = useI18n();
  const socialFriends = useSocialStore((state) => state.friends);

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
  const recommended = useMemo(() => games.slice(0, 8), [games]);

  return (
    <div className="mochi-page mochi-ambient-mesh">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0d12] min-h-[240px] sm:min-h-[280px] flex items-end">
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
              'linear-gradient(90deg, rgba(6,8,12,0.92) 0%, rgba(6,8,12,0.72) 48%, rgba(6,8,12,0.22) 100%), linear-gradient(0deg, rgba(6,8,12,0.9) 0%, rgba(6,8,12,0.2) 60%)'
          }}
        />
        <div className="relative z-10 p-6 sm:p-8 max-w-2xl space-y-3">
          <span className="inline-block px-2.5 py-1 rounded bg-[#00a2ff]/20 border border-[#00a2ff]/40 text-[10px] font-mono font-semibold tracking-wider text-[#7ec8ff] uppercase">
            {t.landing.badge}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight whitespace-pre-line">
            {t.landing.heroTitle}
          </h1>
          <p className="text-sm text-slate-300 max-w-xl">{t.landing.heroSub}</p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {featured[0] && (
              <button
                type="button"
                onClick={() => onPlayGame(featured[0])}
                className="mochi-btn-primary inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>{t.landing.playNow}</span>
              </button>
            )}
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('studio')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold border border-white/15 backdrop-blur-sm transition-colors"
              >
                <Wrench className="w-4 h-4" />
                <span>{t.nav.create}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <div>
        <div className="mochi-eyebrow">MOCHI // DASHBOARD</div>
        <h2 className="mochi-page-title">{t.dashboard.homeTitle}</h2>
      </div>

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
          <h3 className="text-sm font-bold text-[color:var(--mochi-text)]">{t.catalog.title}</h3>
          <p className="mochi-page-sub mx-auto mt-1">{t.catalog.subtitle}</p>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-extrabold text-[color:var(--mochi-text)] tracking-tight">
              {t.dashboard.continuePlaying}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map((game, index) => {
                const theme = CARD_THEMES[index % CARD_THEMES.length];
                return (
                  <GameCard3D
                    key={game.id}
                    game={game}
                    tag={tagFor(game)}
                    gradient={theme.gradient}
                    accentClass={theme.accentClass}
                    icon={theme.Icon}
                    onPlay={onPlayGame}
                  />
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold text-[color:var(--mochi-text)] tracking-tight">
                {t.dashboard.recommendedForYou}
              </h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {recommended.map((game, index) => {
                const theme = CARD_THEMES[(index + 3) % CARD_THEMES.length];
                return (
                  <GameCard3D
                    key={`rec_${game.id}`}
                    game={game}
                    tag={tagFor(game)}
                    gradient={theme.gradient}
                    accentClass={theme.accentClass}
                    icon={theme.Icon}
                    onPlay={onPlayGame}
                  />
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default DashboardHome;
