// Mochi left navigation sidebar with every portal section wired

import React, { Suspense, useState } from 'react';
import {
  Home,
  User,
  Sparkles,
  MessageSquare,
  Users,
  Shirt,
  ShoppingBag,
  Package,
  ArrowLeftRight,
  Globe2,
  Newspaper,
  Shield,
  LogOut,
  Settings,
  Compass
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import { UserProfile } from '../api/types';
import { canAccessAdminPortal } from '../api/admin';
import { useSocialStore } from '../store/useSocialStore';
// The avatar editor pulls in three.js, so it only loads when the user opens it.
const AvatarEditorModal = React.lazy(() =>
  import('./avatar/AvatarEditorModal').then((m) => ({ default: m.AvatarEditorModal }))
);

export interface SidebarProps {
  user: UserProfile;
  isOpen: boolean;
  activeSection: string;
  onSelectSection: (section: string) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

// Persistent authenticated left sidebar supporting workspace sections and RBAC admin portal link
export const Sidebar: React.FC<SidebarProps> = ({
  user,
  isOpen,
  activeSection,
  onSelectSection,
  onOpenProfile,
  onLogout
}) => {
  const { t } = useI18n();
  const isAdmin = canAccessAdminPortal(user);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const friends = useSocialStore((state) => state.friends);
  const threads = useSocialStore((state) => state.threads);
  const unreadThreads = threads.reduce((total, thread) => total + thread.unread, 0);

  if (!isOpen) return null;

  const sections = [
    { id: 'home', label: t.nav.home, Icon: Home },
    { id: 'catalog', label: t.nav.charts, Icon: Compass },
    { id: 'messages', label: t.nav.messages, Icon: MessageSquare, badge: unreadThreads },
    { id: 'friends', label: t.nav.friends, Icon: Users, badge: friends.length },
    { id: 'shop', label: t.nav.marketplace, Icon: ShoppingBag },
    { id: 'inventory', label: t.nav.inventory, Icon: Package },
    { id: 'trade', label: t.nav.trade, Icon: ArrowLeftRight },
    { id: 'groups', label: t.nav.groups, Icon: Globe2 },
    { id: 'news', label: t.nav.news, Icon: Newspaper },
    { id: 'plus', label: t.nav.mochiPlus, Icon: Sparkles },
    { id: 'settings', label: t.nav.settings, Icon: Settings }
  ];

  const itemClass = (id: string) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
      activeSection === id
        ? 'bg-slate-200/80 text-slate-900 border border-slate-300 dark:bg-white/[0.08] dark:text-white dark:border-white/[0.08]'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.04]'
    }`;

  return (
    <>
      <aside className="w-56 shrink-0 bg-white/95 dark:bg-[#0e1118]/90 backdrop-blur-xl border-r border-slate-200 dark:border-white/[0.08] min-h-[calc(100vh-53px)] flex flex-col justify-between p-3 select-none transition-colors">
        <div className="space-y-4">
          {/* User Mini Profile Card */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-full flex items-center space-x-3 p-2.5 rounded-xl bg-slate-100/70 hover:bg-slate-100 dark:bg-white/[0.025] dark:hover:bg-white/[0.05] border border-slate-200 dark:border-white/[0.06] transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#6f9ef5] to-indigo-600 flex items-center justify-center font-bold text-sm text-white border border-white/20 shrink-0">
              {user.displayName?.[0]?.toUpperCase() || user.username[0]?.toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#6f9ef5] truncate transition-colors">
                {user.displayName || user.username}
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                <span>#{user.numericId}</span>
                {isAdmin && (
                  <span className="px-1.5 py-0.2 rounded bg-[#6f9ef5]/20 text-[#6f9ef5] font-bold">
                    ADMIN
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Section Links */}
          <nav className="space-y-0.5">
            <button type="button" onClick={() => onOpenProfile()} className={itemClass('profile')}>
              <span className="flex items-center space-x-3">
                <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                <span>{t.nav.profile}</span>
              </span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onSelectSection('admin')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  activeSection === 'admin'
                    ? 'bg-[#6f9ef5]/20 border-[#6f9ef5]/40 text-[#6f9ef5]'
                    : 'border-transparent text-sky-600 dark:text-sky-300 hover:text-[#6f9ef5] hover:bg-[#6f9ef5]/10'
                }`}
              >
                <Shield className="w-4 h-4 text-[#6f9ef5]" />
                <span>{t.admin.navLabel}</span>
              </button>
            )}

            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={itemClass(section.id)}
              >
                <span className="flex items-center space-x-3">
                  <section.Icon className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                  <span>{section.label}</span>
                </span>
                {Boolean(section.badge) && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                    {section.badge}
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setIsAvatarEditorOpen(true)}
              className={itemClass('avatar')}
            >
              <span className="flex items-center space-x-3">
                <Shirt className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                <span>{t.nav.avatar}</span>
              </span>
            </button>
          </nav>
        </div>

        {/* Sign Out Control */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>{t.nav.signOut}</span>
        </button>
      </aside>
      {isAvatarEditorOpen && (
        <Suspense fallback={null}>
          <AvatarEditorModal isOpen={isAvatarEditorOpen} onClose={() => setIsAvatarEditorOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default Sidebar;
