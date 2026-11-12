// Mochi Plus page: membership status and benefit preview backed by the social store

import React from 'react';
import { Check, Crown, Sparkles, Zap } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { useI18n } from '../i18n/context';
import { useSocialStore } from '../store/useSocialStore';

export const MochiPlusPage: React.FC = () => {
  const { t } = useI18n();
  const p = t.pages;
  const isPlusMember = useSocialStore((state) => state.isPlusMember);
  const setPlusMember = useSocialStore((state) => state.setPlusMember);

  const benefits = [p.plusBenefit1, p.plusBenefit2, p.plusBenefit3, p.plusBenefit4];

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI PLUS"
        icon={Crown}
        title={p.plusTitle}
        subtitle={p.plusSubtitle}
        badge={
          <span className="mochi-chip">
            {isPlusMember ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isPlusMember ? 'ACTIVE' : 'PREVIEW'}
          </span>
        }
      />

      <section className="mochi-card-soft flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="mochi-icon-badge">
            <Zap className="w-5 h-5" />
          </span>
          <p className="text-sm font-bold text-[color:var(--mochi-text)]">
            {isPlusMember ? p.plusActive : p.plusInactive}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPlusMember(!isPlusMember)}
          className={
            isPlusMember
              ? 'mochi-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold self-start'
              : 'mochi-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold self-start'
          }
        >
          <Crown className="w-4 h-4" />
          {isPlusMember ? p.plusDeactivate : p.plusActivate}
        </button>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {benefits.map((benefit) => (
          <div key={benefit} className="mochi-card-soft flex items-start gap-3">
            <span className="mochi-icon-badge">
              <Check className="w-4 h-4" />
            </span>
            <p className="text-xs leading-relaxed text-[color:var(--mochi-text-sub)]">{benefit}</p>
          </div>
        ))}
      </div>

      <p className="mochi-meta">{p.localOnly}</p>
    </div>
  );
};

export default MochiPlusPage;
