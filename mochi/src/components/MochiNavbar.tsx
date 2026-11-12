// Mochi Top Navigation Bar with Dark Glassmorphism, Brand Mark, Coin Pill, and Admin RBAC Tab

import React, { useState } from 'react';
import { Search, Bell, Settings, Coins, Menu, Shield, Sun, Moon } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserProfile } from '../api/types';
import { canAccessAdminPortal } from '../api/admin';
import { useThemeStore } from '../store/useThemeStore';
import { useSocialStore } from '../store/useSocialStore';
import { ANNOUNCEMENTS } from '../data/announcements';

export type MochiNavTab =
  | 'home'
  | 'player'
  | 'studio'
  | 'catalog'
  | 'shop'
  | 'admin'
  | 'friends'
  | 'messages'
  | 'inventory'
  | 'trade'
  | 'groups'
  | 'news'
  | 'settings'
  | 'plus';

export interface MochiNavbarProps {
  user: UserProfile | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onToggleSidebar: () => void;
  onNavigateTab: (tab: MochiNavTab) => void;
  onSearch?: (query: string) => void;
  activeTab: MochiNavTab;
}

// Primary top navigation shell with multi-language switcher, coin balance, and admin entry point
export const MochiNavbar: React.FC<MochiNavbarProps> = ({
  user,
  onOpenAuth,
  onOpenProfile,
  onToggleSidebar,
  onNavigateTab,
  onSearch,
  activeTab
}) => {
  const { t } = useI18n();
  const { theme, toggleTheme } = useThemeStore();
  const readNoticeIds = useSocialStore((state) => state.readNoticeIds);
  const [searchDraft, setSearchDraft] = useState('');
  const isAdmin = canAccessAdminPortal(user);
  const coinBalance = user?.coins ?? 100;
  const unreadCount = ANNOUNCEMENTS.filter((item) => !readNoticeIds.includes(item.id)).length;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch?.(searchDraft.trim());
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0e1118]/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.08] px-4 py-2.5 flex items-center justify-between transition-colors">
      {/* Left: Sidebar Toggle, Geometric Brand Emblem, and Primary Nav Tabs */}
      <div className="flex items-center space-x-3.5">
        {user && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={t.nav.toggleSidebar}
            className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigateTab('home')}
          className="group flex items-center space-x-2.5 select-none"
        >
          <span className="w-8 h-8 rounded-[11px] bg-[#d9536f] border border-[#d9536f] flex items-center justify-center transition-colors group-hover:bg-[#c94763]">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-[#fff6e7]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 4.5c4.2 0 7.5 3 7.5 7S16.2 20 12 20s-7.5-4.5-7.5-8.5 3.3-7 7.5-7Z" />
              <circle cx="9.3" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
              <circle cx="14.7" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
              <path d="M10.4 14.4c.5.6 1 .9 1.6.9s1.1-.3 1.6-.9" />
            </svg>
          </span>
          <span className="mochi-wordmark text-lg text-slate-900 dark:text-white uppercase group-hover:text-[#d9536f] transition-colors">
            MOCHI
          </span>
        </button>

        <nav className="hidden md:flex items-center space-x-1 pl-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => onNavigateTab('home')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'home'
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.1] border border-slate-200 dark:border-white/[0.08]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05]'
            }`}
          >
            {t.nav.home}
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('catalog')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'catalog'
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.1] border border-slate-200 dark:border-white/[0.08]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05]'
            }`}
          >
            {t.nav.charts}
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('shop')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'shop'
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.1] border border-slate-200 dark:border-white/[0.08]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05]'
            }`}
          >
            {t.nav.marketplace}
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('studio')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'studio'
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.1] border border-slate-200 dark:border-white/[0.08]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.05]'
            }`}
          >
            {t.nav.create}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigateTab('admin')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
                activeTab === 'admin'
                  ? 'bg-[#00a2ff]/20 border-[#00a2ff]/40 text-[#00a2ff]'
                  : 'border-[#00a2ff]/20 bg-[#00a2ff]/5 text-sky-300 hover:bg-[#00a2ff]/15 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{t.admin.navLabel}</span>
            </button>
          )}
        </nav>
      </div>

      {/* Middle: Global Discovery Search Bar */}
      <form onSubmit={submitSearch} className="flex-1 max-w-md mx-4 hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t.nav.search}
            aria-label={t.nav.search}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-[#090b10]/90 border border-slate-200 dark:border-white/[0.08] focus:border-[#00a2ff] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-colors"
          />
        </div>
      </form>

      {/* Right: Language Switcher, Theme Toggle, Coin Pill, and Account Controls */}
      <div className="flex items-center space-x-2.5">
        <LanguageSwitcher />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-500" />}
        </button>

        {user ? (
          <>
            <button
              type="button"
              onClick={() => onNavigateTab('shop')}
              title="Mochi Coins Wallet"
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-[#121621] border border-amber-500/25 text-xs font-mono font-bold text-amber-600 dark:text-amber-300 shadow-sm hover:border-amber-500/50 transition-colors cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>{coinBalance.toLocaleString()}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('news')}
              aria-label={t.nav.notifications}
              title={t.nav.notifications}
              className="relative p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#00a2ff] text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              aria-label={t.nav.settings}
              title={t.nav.settings}
              className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center space-x-2 pl-1 group text-left"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#00a2ff] to-indigo-600 flex items-center justify-center font-bold text-xs text-white border border-white/20 group-hover:border-[#00a2ff] transition-colors">
                {user.displayName?.[0]?.toUpperCase() || user.username[0]?.toUpperCase()}
              </div>
              <span className="hidden lg:inline text-xs font-bold font-mono text-slate-700 dark:text-slate-200 group-hover:text-[#00a2ff] transition-colors">
                #{user.numericId}
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-4 py-1.5 bg-[#241f33] text-[#faf4e8] dark:bg-[#f4ede1] dark:text-[#241f33] hover:bg-[#3a3350] dark:hover:bg-white rounded-xl text-xs font-bold tracking-wide transition-colors"
          >
            {t.nav.signIn}
          </button>
        )}
      </div>
    </header>
  );
};

export default MochiNavbar;
