// Settings page: theme, language, motion, density, account, and local data

import React, { useState } from 'react';
import { Check, Info, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { AccountSecurityCard } from '../components/settings/AccountSecurityCard';
import { useI18n } from '../i18n/context';
import { SUPPORTED_LANGUAGES, Language } from '../i18n/types';
import { useThemeStore } from '../store/useThemeStore';
import { usePreferenceStore } from '../store/usePreferenceStore';
import { useSocialStore } from '../store/useSocialStore';
import { UserProfile } from '../api/types';

export interface SettingsPageProps {
  user: UserProfile | null;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onSignOut, onOpenProfile }) => {
  const { t, lang, setLang } = useI18n();
  const p = t.pages;
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const reduceMotion = usePreferenceStore((state) => state.reduceMotion);
  const setReduceMotion = usePreferenceStore((state) => state.setReduceMotion);
  const density = usePreferenceStore((state) => state.density);
  const setDensity = usePreferenceStore((state) => state.setDensity);
  const resetSocial = useSocialStore((state) => state.resetSocial);
  const [cleared, setCleared] = useState(false);

  const clearLocalData = () => {
    try {
      localStorage.removeItem('mochi_theme');
      localStorage.removeItem('mochi_preferences_v1');
    } catch {
      // Ignore storage errors
    }
    resetSocial();
    setTheme('dark');
    setReduceMotion(false);
    setDensity('comfortable');
    setCleared(true);
  };

  return (
    <div className="mochi-page">
      <PageHeader eyebrow="SETTINGS" icon={Monitor} title={p.settingsTitle} subtitle={p.settingsSubtitle} />

      <section className="mochi-card-soft flex flex-col gap-4">
        <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.appearance}</h2>

        <div className="flex flex-col gap-2">
          <span className="mochi-meta">{p.theme}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              data-active={theme === 'dark'}
              className="mochi-tab inline-flex items-center gap-2"
            >
              <Moon className="w-4 h-4" /> {p.themeDark}
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              data-active={theme === 'light'}
              className="mochi-tab inline-flex items-center gap-2"
            >
              <Sun className="w-4 h-4" /> {p.themeLight}
            </button>
          </div>
        </div>

        <div className="mochi-divider" />

        <div className="flex flex-col gap-2">
          <span className="mochi-meta">{p.languageLabel}</span>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLang(item.code as Language)}
                data-active={lang === item.code}
                className="mochi-tab inline-flex items-center gap-2"
              >
                <span className="text-[10px] font-black tracking-widest">{item.shortCode}</span>
                {item.label}
                {lang === item.code && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </div>

        <div className="mochi-divider" />

        <label className="mochi-row flex items-center justify-between gap-3 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[color:var(--mochi-text)]">{p.reduceMotion}</span>
            <span className="mochi-meta block">{p.reduceMotionHint}</span>
          </span>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
            className="w-4 h-4 accent-sky-500 shrink-0"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="mochi-meta">{p.density}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDensity('comfortable')}
              data-active={density === 'comfortable'}
              className="mochi-tab"
            >
              {p.densityComfortable}
            </button>
            <button
              type="button"
              onClick={() => setDensity('compact')}
              data-active={density === 'compact'}
              className="mochi-tab"
            >
              {p.densityCompact}
            </button>
          </div>
        </div>
      </section>

      <AccountSecurityCard user={user} onSignOut={onSignOut} onOpenProfile={onOpenProfile} />

      <section className="mochi-card-soft flex flex-col gap-3">
        <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.localData}</h2>
        <p className="mochi-page-sub">{p.localOnly}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearLocalData}
            className="mochi-btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
          >
            <Trash2 className="w-4 h-4" /> {p.clearLocalData}
          </button>
          {cleared && (
            <span className="mochi-chip">
              <Check className="w-3.5 h-3.5" /> {p.localDataCleared}
            </span>
          )}
        </div>
      </section>

      <section className="mochi-card-soft flex items-start gap-3">
        <span className="mochi-icon-badge">
          <Info className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.aboutSection}</h2>
          <p className="mochi-page-sub">{p.aboutBody}</p>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
