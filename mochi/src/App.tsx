// Mochi Player app root: portal, catalog, social surfaces and the game viewport.
// Studio lives in its own build; this app only deep-links into it.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MochiNavbar, MochiNavTab } from './components/MochiNavbar';
import { Sidebar } from './components/Sidebar';
import { AppContent } from './components/AppContent';
import { Footer } from './components/Footer';
import { AuthModal, AuthMode } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { useAvatarStore } from './store/useAvatarStore';
import { gamesApi } from './api/games';
import { GameSummary, UserProfile } from './api/types';
import { INITIAL_GAMES, mergePublishedCatalog } from './api/catalogDefaults';
import { canAccessAdminPortal, isAdminPathname } from './api/admin';
import {
  parseStudioRoute, parsePlayRoute, resolveStudioExternalUrl, resolveNavPath,
  resolvePlayPath, isPlayPathname, isStudioPathname, getNavTabFromPathname,
  getAuthModeFromHash, buildMapGameSummary, isCreditsPathname,
  resolveLegalPath, getLegalKindFromPathname
} from './routes/studioRouting';
import { CreditsPage } from './pages/CreditsPage';
import { LegalPage, LegalPageKind } from './components/legal/LegalPage';
import { InstallPrompt } from './components/InstallPrompt';
import { useInstallPrompt } from './pwa/useInstallPrompt';
import { useAppBootstrap } from './apps/shared/useAppBootstrap';
import { AppLoadingScreen } from './apps/shared/AppLoadingScreen';

export const App: React.FC = () => {
  const installPrompt = useInstallPrompt();
  const { user, isInitialized, logout } = useAppBootstrap();

  const [activeTab, setActiveTab] = useState<MochiNavTab>(() => {
    if (typeof window === 'undefined') return 'home';
    const tab = getNavTabFromPathname(window.location.pathname);
    return (tab as MochiNavTab) || 'home';
  });
  const [playMapId, setPlayMapId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? parsePlayRoute(window.location.pathname).mapId : null
  );
  const [isCreditsView, setIsCreditsView] = useState<boolean>(() =>
    typeof window !== 'undefined' && isCreditsPathname(window.location.pathname)
  );
  const [legalKind, setLegalKind] = useState<LegalPageKind | null>(() =>
    (typeof window !== 'undefined' ? getLegalKindFromPathname(window.location.pathname) : null) as
      | LegalPageKind
      | null
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileLookup, setProfileLookup] = useState<string | null>(null);
  const [games, setGames] = useState<GameSummary[]>(INITIAL_GAMES);
  const [activeGame, setActiveGame] = useState<GameSummary | null>(INITIAL_GAMES[0]);
  const [catalogSearch, setCatalogSearch] = useState('');

  const openStudioApp = useCallback((mapId?: string | null) => {
    if (typeof window === 'undefined') return;
    window.open(resolveStudioExternalUrl(mapId), '_blank', 'noopener');
  }, []);

  const navigateToLegal = useCallback((kind: LegalPageKind) => {
    if (typeof window !== 'undefined' && window.history?.pushState) {
      const target = resolveLegalPath(kind);
      if (window.location.pathname !== target) window.history.pushState({}, '', target);
    }
    setIsCreditsView(false);
    setLegalKind(kind);
    setActiveTab('home');
  }, []);

  const navigateToTab = useCallback((nextTab: MochiNavTab, mapId?: string | null) => {
    if (nextTab === 'studio') {
      openStudioApp(mapId);
      return;
    }
    if (typeof window !== 'undefined' && window.history?.pushState) {
      const target = nextTab === 'player' && mapId ? resolvePlayPath(mapId) : resolveNavPath(nextTab);
      if (window.location.pathname !== target) window.history.pushState({}, '', target);
    }
    setPlayMapId(nextTab === 'player' ? mapId || null : null);
    setLegalKind(null);
    setActiveTab(nextTab);
  }, [openStudioApp]);

  const refreshPublishedGames = useCallback(async () => {
    try {
      const res = await gamesApi.list({ limit: 24 });
      if (res?.games && Array.isArray(res.games) && res.games.length > 0) {
        const merged = mergePublishedCatalog(res.games);
        setGames(merged);
        setActiveGame((curr) => curr ?? merged[0] ?? null);
      }
    } catch { /* Fallback */ }
  }, []);

  useEffect(() => { void refreshPublishedGames(); }, [refreshPublishedGames]);
  useEffect(() => { void useAvatarStore.getState().load(); }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleHash = () => {
      const mode = getAuthModeFromHash(window.location.hash);
      if (mode) { setAuthMode(mode as AuthMode); setIsAuthModalOpen(true); }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/);
    if (match) {
      setProfileLookup(decodeURIComponent(match[1]));
      setIsProfileModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePopState = () => {
      const path = window.location.pathname;
      if (isCreditsPathname(path)) { setIsCreditsView(true); return; }
      setIsCreditsView(false);
      const legal = getLegalKindFromPathname(path);
      setLegalKind((legal as LegalPageKind) || null);
      if (legal) return;
      if (isAdminPathname(path)) { setActiveTab('admin'); }
      else if (isPlayPathname(path)) { setPlayMapId(parsePlayRoute(path).mapId); setActiveTab('player'); }
      else {
        setPlayMapId(null);
        const tab = getNavTabFromPathname(path);
        setActiveTab((tab as MochiNavTab) || 'home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Legacy /studio links now hand off to the dedicated Studio app.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStudioPathname(window.location.pathname)) return;
    const { mapId } = parseStudioRoute(window.location.pathname, window.location.search);
    window.location.href = resolveStudioExternalUrl(mapId);
  }, []);

  const handleRequestPlay = (game: GameSummary) => {
    if (!user) { setAuthMode('signin'); setIsAuthModalOpen(true); return; }
    setActiveGame(game);
    navigateToTab('player', game.id);
  };
  const handleOpenAuth = (mode: AuthMode) => { setAuthMode(mode); setIsAuthModalOpen(true); };
  const handleCloseAuth = () => {
    setIsAuthModalOpen(false);
    if (typeof window !== 'undefined' && window.location.hash && getAuthModeFromHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };
  const handleAuthSuccess = (authenticatedUser: UserProfile) => {
    handleCloseAuth();
    if (activeTab === 'admin' && canAccessAdminPortal(authenticatedUser)) { navigateToTab('admin'); return; }
    if (activeTab === 'player' || isPlayPathname(window.location.pathname)) {
      navigateToTab('player', parsePlayRoute(window.location.pathname).mapId);
      return;
    }
    navigateToTab('home');
  };
  const currentPlayGame = useMemo(() => {
    if (playMapId) {
      const match = games.find((g) => g.id === playMapId || g.slug === playMapId);
      return match || buildMapGameSummary(playMapId, user?.id);
    }
    return activeGame;
  }, [playMapId, games, activeGame, user]);

  if (!isInitialized) return <AppLoadingScreen />;
  if (isCreditsView) return <CreditsPage />;
  if (legalKind) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-50 dark:bg-[#090b10] text-slate-900 dark:text-[#ffffff] flex flex-col font-sans transition-colors">
        <main className="flex-1 flex flex-col min-w-0">
          <LegalPage kind={legalKind} />
        </main>
        <Footer onNavigateLegal={navigateToLegal} />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50 dark:bg-[#090b10] text-slate-900 dark:text-[#ffffff] flex flex-col font-sans transition-colors">
      <MochiNavbar
        user={user}
        activeTab={activeTab}
        onOpenAuth={() => handleOpenAuth('signin')}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onNavigateTab={(tab) => {
          if (tab === 'studio') {
            if (!user) { handleOpenAuth('signin'); return; }
            openStudioApp();
            return;
          }
          if (tab === 'player' && !user) { handleOpenAuth('signin'); return; }
          navigateToTab(tab);
        }}
        onSearch={(query) => { setCatalogSearch(query); navigateToTab('catalog'); }}
      />

      <div className="flex-1 flex min-w-0">
        {user && (
          <Sidebar
            user={user}
            isOpen={isSidebarOpen}
            activeSection={activeTab}
            onSelectSection={(sec) => {
              if (sec === 'studio') { openStudioApp(); return; }
              navigateToTab(sec as MochiNavTab);
            }}
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onLogout={() => { logout(); navigateToTab('home'); }}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <AppContent
            activeTab={activeTab}
            user={user}
            games={games}
            activeGame={activeGame}
            playMapId={playMapId}
            currentPlayGame={currentPlayGame}
            catalogSearch={catalogSearch}
            onPlayGame={handleRequestPlay}
            onNavigateTab={navigateToTab}
            onOpenAuth={handleOpenAuth}
            onSignOut={() => { logout(); navigateToTab('home'); }}
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onCatalogChanged={() => void refreshPublishedGames()}
          />
        </main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={handleCloseAuth} onSuccess={handleAuthSuccess} initialMode={authMode} />
      <UserProfileModal currentUser={user} isOpen={isProfileModalOpen} onClose={() => { setIsProfileModalOpen(false); setProfileLookup(null); }} onSelectGame={handleRequestPlay} lookupIdentifier={profileLookup} />
      <Footer onNavigateLegal={navigateToLegal} />
      <InstallPrompt
        {...installPrompt}
        hidden={activeTab === 'player' || isAuthModalOpen || isProfileModalOpen}
        onInstall={installPrompt.install}
        onDismiss={installPrompt.dismiss}
      />
    </div>
  );
};

export default App;
