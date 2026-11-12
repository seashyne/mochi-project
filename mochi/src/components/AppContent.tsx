// Main portal viewport switcher: renders the active Mochi page for the current route.
// Only the landing and catalog surfaces ship in the initial bundle; everything
// else is code-split so first paint never pays for three.js, the Lua VM or the
// admin tools.

import React, { Suspense, useState } from 'react';
import { LandingHero } from './LandingHero';
import { DashboardHome } from './DashboardHome';
import { GameCatalog } from './GameCatalog';
import { AdminForbidden } from './admin/AdminForbidden';
import { useSocialStore } from '../store/useSocialStore';
import { canAccessAdminPortal } from '../api/admin';
import { AuthMode } from './AuthModal';
import type { MochiNavTab } from './MochiNavbar';
import { GameSummary, UserProfile } from '../api/types';

const PlayerViewport = React.lazy(() => import('./PlayerViewport'));
const AdminPortal = React.lazy(() => import('./admin/AdminPortal'));
const ShopPage = React.lazy(() => import('./shop/ShopPage').then((m) => ({ default: m.ShopPage })));
const FriendsPage = React.lazy(() => import('../pages/FriendsPage'));
const MessagesPage = React.lazy(() => import('../pages/MessagesPage'));
const InventoryPage = React.lazy(() => import('../pages/InventoryPage'));
const TradePage = React.lazy(() => import('../pages/TradePage'));
const GroupsPage = React.lazy(() => import('../pages/GroupsPage'));
const NewsPage = React.lazy(() => import('../pages/NewsPage'));
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'));
const MochiPlusPage = React.lazy(() => import('../pages/MochiPlusPage'));

const RouteFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-24">
    <div className="w-8 h-8 rounded-full border-2 border-[#00a2ff]/25 border-t-[#00a2ff] animate-spin" />
  </div>
);

export interface AppContentProps {
  activeTab: MochiNavTab;
  user: UserProfile | null;
  games: GameSummary[];
  activeGame: GameSummary | null;
  playMapId: string | null;
  currentPlayGame: GameSummary | null;
  catalogSearch: string;
  onPlayGame: (game: GameSummary) => void;
  onNavigateTab: (tab: MochiNavTab) => void;
  onOpenAuth: (mode: AuthMode) => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  onCatalogChanged?: () => void;
}

export const AppContent: React.FC<AppContentProps> = ({
  activeTab,
  user,
  games,
  activeGame,
  playMapId,
  currentPlayGame,
  catalogSearch,
  onPlayGame,
  onNavigateTab,
  onOpenAuth,
  onSignOut,
  onOpenProfile,
  onCatalogChanged
}) => {
  const [messageFocus, setMessageFocus] = useState<string | null>(null);

  const openMessages = (name: string) => {
    const threadId = useSocialStore.getState().ensureThread(name);
    setMessageFocus(threadId);
    onNavigateTab('messages');
  };

  const renderRoute = (): React.ReactNode => {
    if (activeTab === 'admin') {
      if (user && canAccessAdminPortal(user)) {
        return <AdminPortal currentUser={user} onCatalogChanged={onCatalogChanged} />;
      }
      return (
        <AdminForbidden
          isAuthenticated={Boolean(user)}
          onReturnHome={() => onNavigateTab('home')}
          onOpenSignIn={() => onOpenAuth('signin')}
        />
      );
    }

    if (activeTab === 'shop') {
      return <ShopPage onOpenAuth={() => onOpenAuth('signin')} />;
    }

    if (!user) {
      return (
        <LandingHero
          games={games}
          onOpenSignIn={() => onOpenAuth('signin')}
          onOpenSignUp={() => onOpenAuth('signup')}
          onRequestPlay={onPlayGame}
        />
      );
    }

    switch (activeTab) {
      case 'player':
        return <PlayerViewport activeGame={playMapId ? currentPlayGame : activeGame} />;
      case 'catalog':
        return (
          <div className="max-w-7xl mx-auto w-full px-2 sm:px-4 py-4">
            <GameCatalog games={games} onPlayGame={onPlayGame} initialSearch={catalogSearch} />
          </div>
        );
      case 'friends':
        return <FriendsPage onOpenMessages={openMessages} />;
      case 'messages':
        return <MessagesPage key={messageFocus || 'inbox'} initialThreadId={messageFocus} />;
      case 'inventory':
        return <InventoryPage onGoShop={() => onNavigateTab('shop')} />;
      case 'trade':
        return (
          <TradePage
            onGoShop={() => onNavigateTab('shop')}
            onOpenFriends={() => onNavigateTab('friends')}
          />
        );
      case 'groups':
        return <GroupsPage />;
      case 'news':
        return <NewsPage />;
      case 'settings':
        return <SettingsPage user={user} onSignOut={onSignOut} onOpenProfile={onOpenProfile} />;
      case 'plus':
        return <MochiPlusPage />;
      case 'home':
      default:
        return (
          <DashboardHome games={games} onPlayGame={onPlayGame} onNavigateTab={onNavigateTab} />
        );
    }
  };

  return <Suspense fallback={<RouteFallback />}>{renderRoute()}</Suspense>;
};

export default AppContent;
