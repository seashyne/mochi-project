// Player & creator profile: live identity editing, avatar studio, share links, and published worlds

import React, { Suspense, useEffect, useState } from 'react';
import { User, Search, X, Gamepad2 } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { UserProfile, GameSummary } from '../api/types';
import { authApi } from '../api/auth';
import { EmailVerificationCard } from './profile/EmailVerificationCard';
import { ProfileIdentityCard } from './profile/ProfileIdentityCard';
import { ProfileShareCard } from './profile/ProfileShareCard';
// The avatar editor pulls in three.js, so it only loads when the user opens it.
const AvatarEditorModal = React.lazy(() =>
  import('./avatar/AvatarEditorModal').then((m) => ({ default: m.AvatarEditorModal }))
);

export interface UserProfileModalProps {
  currentUser: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (game: GameSummary) => void;
  lookupIdentifier?: string | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onSelectGame,
  lookupIdentifier
}) => {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState('');
  const [searchedUser, setSearchedUser] = useState<UserProfile | null>(null);
  const [userGames, setUserGames] = useState<GameSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearchedUser(null);
    setUserGames([]);
    setSearchError(null);
    const load = async () => {
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
  }, [isOpen, lookupIdentifier, currentUser?.id, t.profile.notFound]);

  if (!isOpen) return null;

  const displayUser = searchedUser || currentUser;
  const isSelf = Boolean(currentUser && displayUser && displayUser.id === currentUser.id);

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

  const handleUserUpdated = (u: UserProfile) => {
    if (searchedUser?.id === u.id) setSearchedUser(u);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090b10]/85 backdrop-blur-md">
      <div className="mochi-glass-panel rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-mochi-glass flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-100/70 dark:bg-[#090b10]/45">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00a2ff]/15 border border-[#00a2ff]/30 flex items-center justify-center text-[#38bdf8]">
              <User className="w-4 h-4" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t.profile.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.profile.cancel}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-2">
          <form onSubmit={handleSearch} className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.profile.searchPlaceholder}
              className="mochi-input w-full pl-10 pr-24 py-2.5 rounded-xl text-xs"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="mochi-btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {isSearching ? t.profile.searching : t.profile.searchBtn}
            </button>
          </form>
          {searchError && <p className="text-xs text-rose-400 mt-2">{searchError}</p>}
        </div>

        {displayUser ? (
          <div className="p-6 space-y-5">
            <ProfileIdentityCard
              user={displayUser}
              isSelf={isSelf}
              onUserUpdated={handleUserUpdated}
              onOpenAvatar={() => setIsAvatarOpen(true)}
            />

            <ProfileShareCard user={displayUser} />

            {isSelf && currentUser && (
              <EmailVerificationCard user={currentUser} onUserUpdated={handleUserUpdated} />
            )}

            {userGames.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Gamepad2 className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>
                    {t.profile.publishedGames} ({userGames.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-40 overflow-y-auto">
                  {userGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        onSelectGame(g);
                        onClose();
                      }}
                      className="mochi-card-glow text-left p-3 rounded-xl"
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{g.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {g.playCount.toLocaleString()} {t.catalog.plays}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">{t.profile.signInPrompt}</div>
        )}
      </div>

      {isAvatarOpen && (
        <Suspense fallback={null}>
          <AvatarEditorModal isOpen onClose={() => setIsAvatarOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default UserProfileModal;
