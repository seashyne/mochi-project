// Shows which room instance the player landed in and lets them copy an invite
// link that puts a friend into the same shard.

import { useEffect, useState } from 'react';
import { Check, Copy, Users } from 'lucide-react';
import { RealtimeRoomClient, buildRoomInviteUrl, readShardParam } from '../../api/rooms';
import { useI18n } from '../../i18n/context';

export interface RoomInviteChipProps {
  roomClient: RealtimeRoomClient | null;
}

export function RoomInviteChip({ roomClient }: RoomInviteChipProps) {
  const { t } = useI18n();
  const [shard, setShard] = useState<number | null>(readShardParam() ?? null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomClient) return;
    const unsubscribe = roomClient.subscribe((event) => {
      if (event.type !== 'room_state') return;
      const value = (event.data as { shard?: unknown } | undefined)?.shard;
      if (typeof value === 'number') setShard(value);
    });
    return unsubscribe;
  }, [roomClient]);

  if (shard === null) return null;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(buildRoomInviteUrl(shard));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable in insecure contexts; the chip stays idle.
    }
  };

  return (
    <div className="absolute top-3 right-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#090b10]/85 backdrop-blur-md border border-white/[0.08] text-[11px] font-mono text-slate-300">
      <Users className="w-3.5 h-3.5 text-[#38bdf8]" />
      <span>{t.player.roomShard} #{shard}</span>
      <button
        type="button"
        onClick={copyInvite}
        title={copied ? t.player.inviteCopied : t.player.copyInvite}
        aria-label={copied ? t.player.inviteCopied : t.player.copyInvite}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 hover:border-[#38bdf8]/60 hover:text-[#38bdf8] transition-colors"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        <span>{copied ? t.player.inviteCopied : t.player.copyInvite}</span>
      </button>
    </div>
  );
}

export default RoomInviteChip;
