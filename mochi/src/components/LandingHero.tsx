// Mochi unauthenticated landing: cinematic hero plate.
// Game catalog grid will be populated from live published games later.

import React from 'react';
import { LogIn } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';

export interface LandingHeroProps {
  games: GameSummary[];
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onRequestPlay: (game: GameSummary) => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onOpenSignIn, onOpenSignUp,
}) => {
  const { t } = useI18n();

  return (
    <div className="landing-shell flex-1">
      <section className="landing-hero">
        <div
          className="landing-hero-media"
          style={{ ['--l-hero-image' as string]: `url(/landing/hero-valley.jpg)` }}
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
    </div>
  );
};

export default LandingHero;
