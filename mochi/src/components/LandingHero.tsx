// Mochi unauthenticated landing: a minimal platform introduction with a clay diorama

import React from 'react';
import { LogIn } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { MochiDiorama } from './landing/MochiDiorama';

export interface LandingHeroProps {
  games: GameSummary[];
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onRequestPlay: (game: GameSummary) => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onOpenSignIn, onOpenSignUp }) => {
  const { t } = useI18n();

  return (
    <div className="landing-shell flex-1">
      <section className="landing-wrap landing-hero">
        <div>
          <div className="landing-title-wrap">
            <h1 className="landing-title">{t.landing.heroTitle}</h1>
            <svg
              className="landing-underline"
              viewBox="0 0 300 16"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M3 11 C60 3 120 13 180 8 C225 4 265 9 297 6"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          </div>

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

        <MochiDiorama />
      </section>
    </div>
  );
};

export default LandingHero;
