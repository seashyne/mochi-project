// Friends page: add, inspect, message, and remove local-first friends

import React, { useState } from 'react';
import { MessageSquare, Trash2, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { AvatarFrame } from '../components/common/AvatarFrame';
import { PresenceBadge } from '../components/common/PresenceBadge';
import { useI18n } from '../i18n/context';
import { useSocialStore, SocialPresence } from '../store/useSocialStore';

export interface FriendsPageProps {
  onOpenMessages?: (name: string) => void;
}

export const FriendsPage: React.FC<FriendsPageProps> = ({ onOpenMessages }) => {
  const { t } = useI18n();
  const p = t.pages;
  const friends = useSocialStore((state) => state.friends);
  const addFriend = useSocialStore((state) => state.addFriend);
  const removeFriend = useSocialStore((state) => state.removeFriend);
  const [name, setName] = useState('');

  const presenceLabel = (presence: SocialPresence): string => {
    if (presence === 'in_game') return p.friendInGame;
    if (presence === 'studio') return p.friendStudio;
    if (presence === 'offline') return p.friendOffline;
    return p.friendOnline;
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (addFriend(name)) setName('');
  };

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI // SOCIAL"
        title={p.friendsTitle}
        subtitle={p.friendsSubtitle}
        icon={Users}
        badge={<span className="mochi-chip-muted mochi-chip">{friends.length}</span>}
      />

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={p.friendNamePlaceholder}
          className="mochi-input-soft flex-1"
        />
        <button
          type="submit"
          className="mochi-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          disabled={!name.trim()}
        >
          <UserPlus className="w-4 h-4" />
          <span>{p.add}</span>
        </button>
      </form>

      {friends.length === 0 ? (
        <PageEmpty icon={Users} title={p.friendsEmpty} hint={p.localOnly} />
      ) : (
        <div className="mochi-list">
          {friends.map((friend) => (
            <div key={friend.id} className="mochi-row">
              <AvatarFrame
                initials={friend.name.slice(0, 2)}
                tier={friend.tier}
                size="sm"
                status={friend.presence}
                statusTitle={presenceLabel(friend.presence)}
                innerGradient={friend.innerGradient}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[color:var(--mochi-text)] truncate">{friend.name}</p>
                <PresenceBadge status={friend.presence} label={presenceLabel(friend.presence)} />
              </div>
              {onOpenMessages && (
                <button
                  type="button"
                  onClick={() => onOpenMessages(friend.name)}
                  className="mochi-btn-ghost"
                  title={p.messageFriend}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">{p.messageFriend}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => removeFriend(friend.id)}
                className="mochi-btn-ghost text-rose-500"
                title={p.remove}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mochi-meta">{p.localOnly}</p>
    </div>
  );
};

export default FriendsPage;
