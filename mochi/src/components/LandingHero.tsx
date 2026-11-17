// Mochi unauthenticated landing: cinematic hero plate followed by a playable worlds grid.

import React from 'react';
import { LogIn, Play, Users } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { resolveGameThumbnail } from './home/gameThumbHelpers';

export interface LandingHeroProps {
  games: GameSummary[];
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onRequestPlay: (game: GameSummary) => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  games,
  onOpenSignIn,
  onOpenSignUp,
  onRequestPlay
}) => {
  const { t } = useI18n();
  const featuredGames = games.slice(0, 6);

  return (
    <div className="landing-shell flex-1">
      <section className="landing-hero">
        <img
          src="/landing/hero-valley.jpg"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="landing-hero-media"
        />
        <div className="landing-hero-scrim" />
        <div className="landing-hero-body">
          <span className="landing-badge">{t.landing.badge}</span>
          <h1 className="landing-title">{t.landing.heroTitle}</h1>
          <p className="landing-sub">{t.landing.heroSub}</p>
          <div className="landing-actions">
            <button type="button" onClick={onOpenSignUp} className="landing-btn-primary">
              {t.landing.createAccount}
            </button>
            <button type="button" onClick={onOpenSignIn} className="landing-btn-secondary">
              <LogIn className="h-4 w-4" />
              {t.landing.signIn}
            </button>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-wrap">
          <div className="landing-section-head">
            <h2 className="landing-section-title">{t.landing.gamesToStart}</h2>
            <p className="landing-section-sub">{t.landing.simpleControls}</p>
          </div>

          {featuredGames.length === 0 ? (
            <div className="landing-empty">{t.landing.defaultDesc}</div>
          ) : (
            <div className="landing-grid">
              {featuredGames.map((game, index) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onRequestPlay(game)}
                  className="landing-game-card"
                >
                  <span className="landing-game-thumb">
                    <img
                      src={resolveGameThumbnail(game, index)}
                      alt={game.title}
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="landing-game-badge">
                      {game.genre || game.currentVersion || '3D'}
                    </span>
                  </span>
                  <div className="landing-game-meta">
                    <h3 className="landing-game-title">{game.title}</h3>
                    <p className="landing-game-desc">
                      {game.description || t.landing.defaultDesc}
                    </p>
                    <div className="landing-game-stats">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {game.playCount.toLocaleString()} {t.catalog.plays}
                      </span>
                      <span className="ms-auto inline-flex items-center gap-1 text-[#00a2ff] font-semibold">
                        <Play className="h-3 w-3" />
                        {t.landing.playNow}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default LandingHero;
