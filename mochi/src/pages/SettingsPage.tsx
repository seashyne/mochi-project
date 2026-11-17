// Pro full-page Account & Settings Hub with semantic section rail and responsive multi-panel workspace

import React, { Suspense, useEffect, useState } from 'react';
import { Sliders, HardDrive, ShieldCheck, UserRound } from 'lucide-react';
import { GameSummary, UserProfile } from '../api/types';
import { useI18n } from '../i18n/context';
import { AccountProfileHero } from '../components/settings/AccountProfileHero';
import { AccountProfileSection } from '../components/settings/AccountProfileSection';
import { AccountSecurityCard } from '../components/settings/AccountSecurityCard';
import { SettingsAppearanceSection } from '../components/settings/SettingsAppearanceSection';

const AvatarEditorModal = React.lazy(() =>
  import('../components/avatar/AvatarEditorModal').then((m) => ({ default: m.AvatarEditorModal }))
);

export type SettingsSection = 'profile' | 'security' | 'preferences' | 'system';

export interface SettingsPageProps {
  user: UserProfile | null;
  initialSection?: SettingsSection;
  lookupIdentifier?: string | null;
  onSelectGame?: (game: GameSummary) => void;
  onClearLookup?: () => void;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  initialSection = 'security',
  lookupIdentifier,
  onSelectGame,
  onClearLookup,
  onSignOut,
  onOpenProfile
}) => {
  const { t } = useI18n();
  const p = t.pages;
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    lookupIdentifier ? 'profile' : initialSection
  );
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  useEffect(() => {
    setActiveSection(lookupIdentifier ? 'profile' : initialSection);
  }, [initialSection, lookupIdentifier]);

  const navItems: { id: SettingsSection; label: string; Icon: typeof UserRound }[] = [
    { id: 'profile', label: p.navProfile, Icon: UserRound },
    { id: 'security', label: p.navSecurity, Icon: ShieldCheck },
    { id: 'preferences', label: p.navPreferences, Icon: Sliders },
    { id: 'system', label: p.navSystem, Icon: HardDrive }
  ];

  const handleOpenProfileSection = () => {
    setActiveSection('profile');
    onOpenProfile?.();
  };

  return (
    <div className="mochi-page">
      <AccountProfileHero
        user={user}
        onOpenAvatar={user ? () => setIsAvatarOpen(true) : undefined}
        onSignOut={user ? onSignOut : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
        <aside className="mochi-card-soft p-2">
          <nav
            aria-label={p.settingsTitle}
            className="flex flex-nowrap overflow-x-auto gap-1.5 lg:flex-col lg:overflow-visible"
          >
            {navItems.map(({ id, label, Icon }) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`shrink-0 lg:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors border ${
                    isActive
                      ? 'bg-[#6f9ef5]/15 text-[color:var(--mochi-text)] border-[#6f9ef5]/45 shadow-sm'
                      : 'border-transparent text-[color:var(--mochi-text-sub)] hover:text-[color:var(--mochi-text)] hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#38bdf8]' : 'text-[color:var(--mochi-text-muted)]'
                    }`}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          {activeSection === 'profile' && (
            <AccountProfileSection
              currentUser={user}
              lookupIdentifier={lookupIdentifier}
              onSelectGame={onSelectGame}
              onOpenAvatar={() => setIsAvatarOpen(true)}
              onClearLookup={onClearLookup}
            />
          )}

          {activeSection === 'security' && (
            <AccountSecurityCard
              user={user}
              onSignOut={onSignOut}
              onOpenProfile={handleOpenProfileSection}
            />
          )}

          {activeSection === 'preferences' && <SettingsAppearanceSection mode="preferences" />}

          {activeSection === 'system' && <SettingsAppearanceSection mode="system" />}
        </div>
      </div>

      {isAvatarOpen && (
        <Suspense fallback={null}>
          <AvatarEditorModal isOpen onClose={() => setIsAvatarOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default SettingsPage;
