// Mochi Studio app root: creator-only shell served from its own build.
// It shares the engine, API client and auth store with the Player app but never
// ships the portal, social or catalog surfaces.

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { StudioHub } from '../../components/studio/StudioHub';
import { AuthModal, AuthMode } from '../../components/AuthModal';
import type { GameSummary, UserProfile } from '../../api/types';
import {
  parseStudioRoute,
  resolveWebPortalUrl,
  resolvePlayerExternalUrl,
  getAuthModeFromHash,
  isStudioSubdomain
} from '../../routes/studioRouting';
import { useAppBootstrap } from '../shared/useAppBootstrap';
import { AppLoadingScreen } from '../shared/AppLoadingScreen';

// The editor viewport, gizmos and asset panels only load once a map is opened,
// so the Studio hub stays light.
const StudioPage = React.lazy(() => import('../../pages/StudioPage'));

function readStudioMapId(): string | null {
  if (typeof window === 'undefined') return null;
  return parseStudioRoute(window.location.pathname, window.location.search, window.location.hostname).mapId;
}

export const StudioApp: React.FC = () => {
  const { user, isInitialized } = useAppBootstrap();
  const onStudioHost = typeof window !== 'undefined' && isStudioSubdomain(window.location.hostname);

  const [mapId, setMapId] = useState<string | null>(readStudioMapId);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'Mochi Studio';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleHash = () => {
      const mode = getAuthModeFromHash(window.location.hash);
      if (mode) {
        setAuthMode(mode as AuthMode);
        setIsAuthOpen(true);
      }
    };
    const handlePopState = () => setMapId(readStudioMapId());
    handleHash();
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    if (mapId && !user) {
      setAuthMode('signin');
      setIsAuthOpen(true);
    }
  }, [isInitialized, mapId, user]);

  const navigateToMap = useCallback((nextId: string | null) => {
    if (typeof window !== 'undefined' && window.history?.pushState) {
      const target = onStudioHost ? (nextId ? `/${nextId}` : '/') : nextId ? `/studio/${nextId}` : '/studio';
      if (window.location.pathname !== target) window.history.pushState({}, '', target);
    }
    setMapId(nextId);
  }, [onStudioHost]);

  const handleCloseAuth = () => {
    setIsAuthOpen(false);
    if (typeof window !== 'undefined' && window.location.hash && getAuthModeFromHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const handleAuthSuccess = (_authenticatedUser: UserProfile) => {
    handleCloseAuth();
  };

  const handleOpenMap = (nextId: string) => {
    if (!user) {
      setAuthMode('signin');
      setIsAuthOpen(true);
      return;
    }
    navigateToMap(nextId);
  };

  const handleGamePublished = (game: GameSummary) => {
    if (typeof window === 'undefined') return;
    window.open(resolvePlayerExternalUrl(game.id), '_blank', 'noopener');
  };

  const handleBackToPortal = () => {
    if (typeof window === 'undefined') return;
    window.location.href = resolveWebPortalUrl();
  };

  if (!isInitialized) return <AppLoadingScreen background="#1e1e24" />;

  return (
    <div className="h-screen w-screen overflow-hidden bg-studio-bg text-studio-text flex flex-col font-sans select-none">
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!mapId ? (
          <div className="flex-1 overflow-y-auto">
            <StudioHub
              onOpenMap={handleOpenMap}
              onRequireAuth={() => { setAuthMode('signin'); setIsAuthOpen(true); }}
              onBackToPortal={handleBackToPortal}
            />
          </div>
        ) : (
          <Suspense fallback={<AppLoadingScreen background="#1e1e24" />}>
            <StudioPage
              key={mapId}
              mapId={mapId}
              onGamePublished={handleGamePublished}
              onExit={() => navigateToMap(null)}
            />
          </Suspense>
        )}
      </main>
      <AuthModal
        isOpen={isAuthOpen}
        onClose={handleCloseAuth}
        onSuccess={handleAuthSuccess}
        initialMode={authMode}
      />
    </div>
  );
};

export default StudioApp;
