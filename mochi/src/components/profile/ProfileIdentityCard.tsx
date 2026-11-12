// Identity card with live display-name editing and avatar customization entry

import React, { useState } from 'react';
import { Check, Hash, Pencil, Shield, Shirt, X } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { UserProfile } from '../../api/types';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { AvatarFrame, AvatarFrameTier } from '../common/AvatarFrame';

export interface ProfileIdentityCardProps {
  user: UserProfile;
  isSelf: boolean;
  onUserUpdated: (user: UserProfile) => void;
  onOpenAvatar: () => void;
}

function resolveRoleTier(role: string): AvatarFrameTier {
  if (role === 'admin') return 'gold';
  if (role === 'creator') return 'cyber';
  return 'silver';
}

export const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({
  user,
  isSelf,
  onUserUpdated,
  onOpenAvatar
}) => {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraftName(user.displayName || user.username);
    setIsEditing(true);
    setNotice(null);
    setError(null);
  };

  const saveName = async () => {
    const clean = draftName.trim();
    if (clean.length < 1 || clean.length > 30) {
      setError(t.profile.nameInvalid);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await authApi.updateProfile(clean);
      useAuthStore.getState().updateUser({ displayName: res.user.displayName });
      onUserUpdated(res.user);
      setIsEditing(false);
      setNotice(t.profile.nameSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.profile.nameInvalid);
    } finally {
      setIsSaving(false);
    }
  };

  const initials = (user.displayName || user.username).slice(0, 2);

  return (
    <div className="bg-slate-50 dark:bg-[#090b10]/75 border border-slate-200 dark:border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-4 min-w-0">
        <AvatarFrame
          initials={initials}
          tier={resolveRoleTier(user.role)}
          size="lg"
          shape="rounded"
          status="online"
        />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={30}
                autoFocus
                className="mochi-input flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={isSaving}
                aria-label={t.profile.saveName}
                className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label={t.profile.cancel}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                {user.displayName || user.username}
              </h3>
              <span className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#00a2ff]/15 text-[#38bdf8] border border-[#00a2ff]/30 font-mono text-xs font-bold">
                <Hash className="w-3 h-3" />
                <span>{user.numericId}</span>
              </span>
              {isSelf && (
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label={t.profile.editName}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            @{user.username}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              <Shield className="w-3 h-3 text-[#38bdf8]" />
              <span className="capitalize">{user.role} {t.profile.account}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                user.isVerified
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
              }`}
            >
              {user.isVerified ? t.profile.verified : t.profile.unverified}
            </span>
          </div>
        </div>
      </div>

      {notice && <p className="text-xs text-emerald-500">{notice}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {isSelf && (
        <button
          type="button"
          onClick={onOpenAvatar}
          className="mochi-btn-secondary inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
        >
          <Shirt className="w-4 h-4" /> {t.profile.customizeAvatar}
        </button>
      )}
    </div>
  );
};

export default ProfileIdentityCard;
