// Pro full-page account center hero banner showing identity, role tier, verification state, and quick actions

import React from 'react';
import { Hash, LogOut, Settings, Shield, ShieldCheck, Shirt } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { UserProfile } from '../../api/types';
import { AvatarFrame, AvatarFrameTier } from '../common/AvatarFrame';

export interface AccountProfileHeroProps {
  user: UserProfile | null;
  onOpenAvatar?: () => void;
  onSignOut?: () => void;
}

function resolveRoleTier(role: string): AvatarFrameTier {
  if (role === 'admin') return 'gold';
  if (role === 'creator') return 'cyber';
  return 'silver';
}

export const AccountProfileHero: React.FC<AccountProfileHeroProps> = ({
  user,
  onOpenAvatar,
  onSignOut
}) => {
  const { t } = useI18n();
  const p = t.pages;

  if (!user) {
    return (
      <header className="mochi-panel flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="mochi-icon-badge">
            <Settings className="w-4 h-4" />
          </span>
          <div>
            <span className="mochi-eyebrow">{p.proSettingsBadge}</span>
            <h1 className="mochi-page-title mt-0.5">{p.settingsTitle}</h1>
            <p className="mochi-page-sub">{p.settingsSubtitle}</p>
          </div>
        </div>
      </header>
    );
  }

  const initials = (user.displayName || user.username).slice(0, 2);

  return (
    <header className="mochi-panel relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-[#5b8def]/15 via-[#8b7cf6]/10 to-transparent"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <AvatarFrame
            initials={initials}
            tier={resolveRoleTier(user.role)}
            size="lg"
            shape="rounded"
            status="online"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mochi-eyebrow">{p.proSettingsBadge}</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  user.isVerified
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{user.isVerified ? t.profile.verified : t.profile.unverified}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mochi-page-title truncate">{user.displayName || user.username}</h1>
              <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#00a2ff]/15 text-[#38bdf8] border border-[#00a2ff]/30 font-mono text-xs font-bold">
                <Hash className="w-3 h-3" />
                <span>{user.numericId}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--mochi-text-sub)]">
              <span className="font-mono">@{user.username}</span>
              <span className="inline-flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span className="capitalize">{user.role} {t.profile.account}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAvatar && (
            <button
              type="button"
              onClick={onOpenAvatar}
              className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
            >
              <Shirt className="w-4 h-4" />
              <span>{t.profile.customizeAvatar}</span>
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="mochi-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span>{p.signOut}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default AccountProfileHero;
