// Full-page profile workspace: player lookup, identity card, share links, verification, and published worlds

import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, Gamepad2, Hash, Search, Shield, UserRound } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { GameSummary, UserProfile } from '../../api/types';
import { authApi } from '../../api/auth';
import { EmailVerificationCard } from '../profile/EmailVerificationCard';
import { ProfileIdentityCard } from '../profile/ProfileIdentityCard';
import { ProfileShareCard } from '../profile/ProfileShareCard';

export interface AccountProfileSectionProps {
  currentUser: UserProfile | null;
  lookupIdentifier?: string | null;
  onSelectGame?: (game: GameSummary) => void;
  onOpenAvatar: () => void;
  onClearLookup?: () => void;
}

export const AccountProfileSection: React.FC<AccountProfileSectionProps> = ({
  currentUser,
  lookupIdentifier,
  onSelectGame,
  onOpenAvatar,
  onClearLookup
}) => {
  const { t } = useI18n();
  const p = t.pages;
  const searchInputId = useId();
  const [searchInput, setSearchInput] = useState(lookupIdentifier || '');
  const [searchedUser, setSearchedUser] = useState<UserProfile | null>(null);
  const [userGames, setUserGames] = useState<GameSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setSearchedUser(null);
    setUserGames([]);
    setSearchError(null);
    if (lookupIdentifier) setSearchInput(lookupIdentifier);

    const load = async () => {
      if (!lookupIdentifier && !currentUser) return;
      setIsSearching(true);
      try {
        if (lookupIdentifier) {
          const res = await authApi.getProfile(lookupIdentifier);
          setSearchedUser(res.user);
          setUserGames(res.games || []);
        } else if (currentUser) {
          const res = await authApi.getProfile(currentUser.username);
          setUserGames(res.games || []);
        }
      } catch {
        if (lookupIdentifier) setSearchError(t.profile.notFound);
      } finally {
        setIsSearching(false);
      }
    };
    void load();
  }, [lookupIdentifier, currentUser?.id, currentUser?.username, t.profile.notFound]);

  const displayUser = searchedUser || currentUser;
  const isSelf = Boolean(currentUser && displayUser && displayUser.id === currentUser.id);
  const isViewingExternal = Boolean(searchedUser && (!currentUser || searchedUser.id !== currentUser.id));

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const clean = searchInput.trim().replace(/^#/, '');
      const res = await authApi.getProfile(clean);
      setSearchedUser(res.user);
      setUserGames(res.games || []);
    } catch {
      setSearchError(t.profile.notFound);
    } finally {
      setIsSearching(false);
    }
  };

  const resetToMyProfile = () => {
    setSearchedUser(null);
    setSearchError(null);
    setSearchInput('');
    onClearLookup?.();
  };

  const handleUserUpdated = (u: UserProfile) => {
    if (searchedUser?.id === u.id) setSearchedUser(u);
  };

  return (
    <div className="space-y-5">
      <section className="mochi-card-soft flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-[color:var(--mochi-blue)]" />
            <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{t.profile.title}</h2>
          </div>
          {isViewingExternal && currentUser && (
            <button
              type="button"
              onClick={resetToMyProfile}
              className="mochi-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{p.backToMyProfile}</span>
            </button>
          )}
        </div>

        <search>
          <form onSubmit={handleSearch} className="relative">
            <label htmlFor={searchInputId} className="sr-only">
              {t.profile.searchPlaceholder}
            </label>
            <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id={searchInputId}
              name="profileQuery"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.profile.searchPlaceholder}
              className="mochi-input w-full ps-10 pe-28 py-2.5 rounded-xl text-xs"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="mochi-btn-primary absolute end-1.5 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {isSearching ? t.profile.searching : t.profile.searchBtn}
            </button>
          </form>
        </search>

        {searchError && <p role="alert" className="text-xs text-rose-400">{searchError}</p>}
        {isViewingExternal && displayUser && (
          <p className="text-xs text-[color:var(--mochi-blue)] font-semibold">
            {p.viewingPublicProfile}: @{displayUser.username}
          </p>
        )}
      </section>

      {displayUser ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-7 space-y-5">
            <ProfileIdentityCard
              user={displayUser}
              isSelf={isSelf}
              onUserUpdated={handleUserUpdated}
              onOpenAvatar={onOpenAvatar}
            />

            <section className="mochi-card-soft">
              <ProfileShareCard user={displayUser} />
            </section>
          </div>

          <div className="xl:col-span-5 space-y-5">
            <section className="mochi-card-soft space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--mochi-text-sub)]">
                {p.memberOverview}
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-[#090b10]/70 border border-slate-200 dark:border-white/[0.06]">
                  <dt className="mochi-meta">{t.profile.account}</dt>
                  <dd className="mt-1 font-bold text-[color:var(--mochi-text)] inline-flex items-center gap-1 capitalize">
                    <Shield className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>{displayUser.role}</span>
                  </dd>
                </div>
                <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-[#090b10]/70 border border-slate-200 dark:border-white/[0.06]">
                  <dt className="mochi-meta">ID</dt>
                  <dd className="mt-1 font-mono font-bold text-[#38bdf8] inline-flex items-center gap-0.5">
                    <Hash className="w-3.5 h-3.5" />
                    <span>{displayUser.numericId}</span>
                  </dd>
                </div>
              </dl>
            </section>

            {isSelf && currentUser && (
              <EmailVerificationCard user={currentUser} onUserUpdated={handleUserUpdated} />
            )}

            <section className="mochi-card-soft space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--mochi-text)]">
                <Gamepad2 className="w-4 h-4 text-[#38bdf8]" />
                <span>
                  {t.profile.publishedGames} ({userGames.length})
                </span>
              </div>
              {userGames.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {userGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onSelectGame?.(g)}
                      className="mochi-card-glow text-start p-3 rounded-xl"
                    >
                      <div className="text-xs font-bold text-[color:var(--mochi-text)] truncate">
                        {g.title}
                      </div>
                      <div className="text-[10px] text-[color:var(--mochi-text-sub)] font-mono mt-0.5">
                        {g.playCount.toLocaleString()} {t.catalog.plays}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mochi-page-sub">{t.profile.publishedGames}: 0</p>
              )}
            </section>
          </div>
        </div>
      ) : (
        <section className="mochi-card-soft py-10 text-center text-xs text-[color:var(--mochi-text-sub)]">
          {t.profile.signInPrompt}
        </section>
      )}
    </div>
  );
};

export default AccountProfileSection;
