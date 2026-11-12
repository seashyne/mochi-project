// Shareable identity: canonical UUID and a profile deep link that opens in the portal

import React, { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { UserProfile } from '../../api/types';

export interface ProfileShareCardProps {
  user: UserProfile;
}

export const ProfileShareCard: React.FC<ProfileShareCardProps> = ({ user }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState<'uuid' | 'url' | null>(null);

  const shareUrl = `https://game.lenout.com/profile/${user.numericId}`;

  const copy = (kind: 'uuid' | 'url', value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {t.profile.canonicalUuid}
        </label>
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/70 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200">
          <span className="truncate mr-3">{user.id}</span>
          <button
            type="button"
            onClick={() => copy('uuid', user.id)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#38bdf8] hover:text-[#00a2ff] transition-colors shrink-0"
          >
            {copied === 'uuid' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === 'uuid' ? t.profile.copied : t.profile.copy}</span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {t.profile.shareableUrl}
        </label>
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/70 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-mono text-[#00a2ff] dark:text-[#38bdf8]">
          <span className="truncate mr-3 select-all">{shareUrl}</span>
          <button
            type="button"
            onClick={() => copy('url', shareUrl)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#38bdf8] hover:text-[#00a2ff] transition-colors shrink-0"
          >
            {copied === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{copied === 'url' ? t.profile.copied : t.profile.copy}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileShareCard;
