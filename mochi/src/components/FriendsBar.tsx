// Horizontal Social & Presence Friends Carousel Strip
// Integrates tiered AvatarFrame rings and animated PresenceBadge indicators for authenticated user & friends

import React from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useAuthStore } from '../store/useAuthStore';
import { AvatarFrame, AvatarFrameTier } from './common/AvatarFrame';
import { PresenceBadge, PresenceStatus } from './common/PresenceBadge';

export interface FriendEntry {
  id: string;
  name: string;
  statusText: string;
  presence: PresenceStatus;
  tier: AvatarFrameTier;
  innerGradient: string;
}

export interface FriendsBarProps {
  friends?: FriendEntry[];
  onViewAll?: () => void;
  onAddFriend?: () => void;
}

export const FriendsBar: React.FC<FriendsBarProps> = ({ friends = [], onViewAll, onAddFriend }) => {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);

  const activeFriends = friends.filter((f) => f.presence !== 'offline').length;
  const activeCount = user ? activeFriends + 1 : activeFriends;

  return (
    <section className="mochi-glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Section Header & Live Active Counter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-studio-text tracking-tight">
            {t.dashboard.friends}
          </h2>
          <PresenceBadge
            status={activeCount > 0 ? 'online' : 'offline'}
            label={`${activeCount} ${t.dashboard.online}`}
            size="sm"
          />
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-slate-600 dark:text-studio-muted hover:text-studio-accent inline-flex items-center gap-1 font-semibold transition-colors"
        >
          <span>{t.dashboard.viewAll}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Horizontal Social Avatar Carousel */}
      <div className="flex items-center gap-4 overflow-x-auto pb-1.5">
        {/* Add Friend Trigger */}
        <button
          type="button"
          onClick={onAddFriend}
          className="flex flex-col items-center space-y-1.5 shrink-0 group focus:outline-none"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-studio-panel border border-dashed border-slate-300 dark:border-studio-border group-hover:border-studio-accent flex items-center justify-center text-slate-600 dark:text-studio-muted group-hover:text-studio-text transition-all">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-studio-muted group-hover:text-slate-900 dark:group-hover:text-studio-text truncate max-w-[68px] transition-colors">
            {t.dashboard.addFriend}
          </span>
        </button>

        {/* Real Authenticated User Card */}
        {user && (
          <div
            className="flex flex-col items-center space-y-1 shrink-0 cursor-pointer group w-[74px]"
          >
            <div className="group-hover:-translate-y-0.5 transition-transform duration-200">
              <AvatarFrame
                initials={(user.displayName || user.username).slice(0, 2).toUpperCase()}
                tier={user.role === 'admin' ? 'gold' : 'cyber'}
                size="md"
                status="online"
                statusTitle={t.dashboard.online}
                innerGradient="from-sky-900 via-slate-900 to-indigo-950"
              />
            </div>

            <span className="text-[11px] font-bold text-slate-800 dark:text-studio-text group-hover:text-studio-accent truncate w-full text-center transition-colors">
              {user.displayName || user.username}
            </span>
            <span className="text-[10px] font-mono text-emerald-500 truncate w-full text-center">
              {t.dashboard.online}
            </span>
          </div>
        )}

        {/* Real Friends List */}
        {friends.map((friend) => (
          <div
            key={friend.id}
            className="flex flex-col items-center space-y-1 shrink-0 cursor-pointer group w-[74px]"
          >
            <div className="group-hover:-translate-y-0.5 transition-transform duration-200">
              <AvatarFrame
                initials={friend.name.slice(0, 2)}
                tier={friend.tier}
                size="md"
                status={friend.presence}
                statusTitle={
                  friend.presence === 'in_game'
                    ? t.dashboard.inGame
                    : friend.presence === 'offline'
                    ? t.dashboard.offline
                    : t.dashboard.online
                }
                innerGradient={friend.innerGradient}
              />
            </div>

            <span className="text-[11px] font-bold text-slate-800 dark:text-studio-text group-hover:text-studio-accent truncate w-full text-center transition-colors">
              {friend.name}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-studio-muted truncate w-full text-center">
              {friend.statusText}
            </span>
          </div>
        ))}

        {/* Clean Empty State or Guest State */}
        {friends.length === 0 && (
          <div className="flex items-center px-4 py-3 text-xs text-slate-500 dark:text-studio-muted border border-dashed border-slate-300 dark:border-studio-border/60 rounded-xl whitespace-nowrap">
            {user
              ? 'No friends online yet'
              : 'Sign in to view friends and online presence'}
          </div>
        )}
      </div>
    </section>
  );
};

export default FriendsBar;
