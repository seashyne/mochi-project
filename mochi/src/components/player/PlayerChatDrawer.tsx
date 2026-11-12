// Collapsible Glassmorphic Multiplayer Room Chat & Online Players Drawer
// Displays active room peers with AvatarFrame/PresenceBadge and an interactive room message feed

import React, { useEffect, useState } from 'react';
import { Send, Users, MessageSquare, X } from 'lucide-react';
import { AvatarFrame, AvatarFrameTier } from '../common/AvatarFrame';
import { PresenceBadge } from '../common/PresenceBadge';
import { useAuthStore } from '../../store/useAuthStore';
import { useI18n } from '../../i18n/context';
import { RealtimeRoomClient } from '../../api/rooms';
import { PlayerPresence, RoomEvent } from '../../api/types';

export interface PlayerChatDrawerProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  roomClient?: RealtimeRoomClient | null;
}

interface RoomChatMessage {
  id: string;
  sender: string;
  tier: AvatarFrameTier;
  text: string;
  timestamp: string;
}

const INITIAL_MESSAGES: RoomChatMessage[] = [
  {
    id: 'm1',
    sender: 'Astra',
    tier: 'cyber',
    text: 'Checkpoint 3 cleared at 60Hz physics tick.',
    timestamp: '12:01'
  },
  {
    id: 'm2',
    sender: 'Lycan',
    tier: 'gold',
    text: 'Boost pad timing on the upper ring is super smooth!',
    timestamp: '12:02'
  }
];

const ROOM_PEERS: { id: string; name: string; tier: AvatarFrameTier }[] = [
  { id: 'p_astra', name: 'Astra', tier: 'cyber' },
  { id: 'p_lycan', name: 'Lycan', tier: 'gold' },
  { id: 'p_pete', name: 'Pete', tier: 'silver' }
];

export const PlayerChatDrawer: React.FC<PlayerChatDrawerProps> = ({
  roomId,
  isOpen,
  onClose,
  roomClient
}) => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<RoomChatMessage[]>(INITIAL_MESSAGES);
  const [peers, setPeers] = useState<{ id: string; name: string; tier: AvatarFrameTier }[]>(ROOM_PEERS);
  const [draft, setDraft] = useState('');

  // Subscribe to realtime room events when roomClient is available
  useEffect(() => {
    if (!roomClient) return;

    const unsubscribe = roomClient.subscribe((event: RoomEvent) => {
      const now = new Date();
      const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      if (event.type === 'chat') {
        const data = event.data as { username?: string; message?: string } | string | undefined;
        const msgText = typeof data === 'object' && data !== null ? data.message || '' : String(data || '');
        const sender = typeof data === 'object' && data !== null ? data.username || 'Peer' : 'Peer';
        setMessages((prev) => [
          ...prev,
          { id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, sender, tier: 'cyber', text: msgText, timestamp: hhmm }
        ]);
      } else if (event.type === 'room_state') {
        const data = event.data as { players?: PlayerPresence[] } | undefined;
        if (data?.players) {
          const list = data.players.map((p) => ({
            id: p.id,
            name: p.username || 'Player',
            tier: 'gold' as AvatarFrameTier
          }));
          setPeers(list.length > 0 ? list : ROOM_PEERS);
        }
      } else if (event.type === 'player_joined') {
        const p = event.data as PlayerPresence | undefined;
        if (p?.username) {
          setPeers((prev) => [...prev.filter((x) => x.id !== p.id), { id: p.id, name: p.username, tier: 'cyber' }]);
        }
      } else if (event.type === 'player_left') {
        const p = event.data as { playerId?: string } | undefined;
        if (p?.playerId) {
          setPeers((prev) => prev.filter((x) => x.id !== p.playerId));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomClient]);

  if (!isOpen) return null;

  const senderName = user?.displayName || user?.username || 'Player';

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    const now = new Date();
    const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    if (roomClient && roomClient.isConnected()) {
      roomClient.send({
        type: 'chat',
        data: trimmed
      });
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          sender: senderName,
          tier: 'cyber',
          text: trimmed,
          timestamp: hhmm
        }
      ]);
    }
    setDraft('');
  };

  return (
    <aside className="absolute top-3 right-3 bottom-14 w-72 sm:w-80 z-20 mochi-glass-panel rounded-2xl flex flex-col overflow-hidden shadow-mochi-glass">
      {/* Drawer Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-slate-100/80 dark:bg-[#090b10]/55">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-[#38bdf8] shrink-0" />
          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{roomId}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.player.closeChat}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Active Room Players Roster */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-white/[0.07] space-y-2 bg-slate-50/70 dark:bg-[#090b10]/35">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Users className="w-3 h-3 text-[#38bdf8]" />
            <span>{t.player.roomPlayers} ({peers.length + 1})</span>
          </span>
          <PresenceBadge status="in_game" label="LIVE" size="sm" />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#00a2ff]/12 border border-[#00a2ff]/30 shrink-0">
            <AvatarFrame initials={senderName.slice(0, 2)} tier="cyber" size="sm" />
            <span className="text-[11px] font-bold text-slate-900 dark:text-white max-w-[72px] truncate">
              {senderName}
            </span>
          </div>

          {peers.map((peer) => (
            <div
              key={peer.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] shrink-0"
            >
              <AvatarFrame initials={peer.name.slice(0, 2)} tier={peer.tier} size="sm" />
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">{peer.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable Chat Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="p-2.5 rounded-xl bg-slate-100/90 dark:bg-[#090b10]/70 border border-slate-200 dark:border-white/[0.06] space-y-1"
          >
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="font-bold text-[#00a2ff] dark:text-[#38bdf8]">{msg.sender}</span>
              <span className="text-slate-500">{msg.timestamp}</span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed break-words">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* Chat Composer */}
      <form
        onSubmit={handleSendMessage}
        className="p-2.5 border-t border-slate-200 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#090b10]/65 flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.player.chatPlaceholder}
          maxLength={180}
          className="mochi-input flex-1 px-3 py-1.5 rounded-xl text-xs"
        />
        <button
          type="submit"
          aria-label={t.player.sendMessage}
          className="mochi-btn-primary p-2 rounded-xl shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
};

export default PlayerChatDrawer;
