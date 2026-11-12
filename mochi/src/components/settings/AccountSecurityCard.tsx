// Account management: display name, password rotation, email verification, session controls

import React, { useState } from 'react';
import { Check, KeyRound, LogOut, User, UserRound } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { UserProfile } from '../../api/types';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { EmailVerificationCard } from '../profile/EmailVerificationCard';

export interface AccountSecurityCardProps {
  user: UserProfile | null;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
}

export const AccountSecurityCard: React.FC<AccountSecurityCardProps> = ({
  user,
  onSignOut,
  onOpenProfile
}) => {
  const { t } = useI18n();
  const p = t.pages;
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [isSavingPw, setIsSavingPw] = useState(false);

  if (!user) {
    return (
      <section className="mochi-card-soft flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[color:var(--mochi-blue)]" />
          <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.accountSection}</h2>
        </div>
        <p className="mochi-page-sub">{p.signedInAs} -</p>
      </section>
    );
  }

  const saveName = async () => {
    const clean = (nameDraft || '').trim();
    if (clean.length < 1 || clean.length > 30) {
      setNameError(t.profile.nameInvalid);
      return;
    }
    setIsSavingName(true);
    setNameError(null);
    try {
      const res = await authApi.updateProfile(clean);
      useAuthStore.getState().updateUser({ displayName: res.user.displayName });
      setNameDraft(null);
      setNameNotice(t.profile.nameSaved);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : t.profile.nameInvalid);
    } finally {
      setIsSavingName(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwNotice(null);
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError(t.auth.passwordHint);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(p.passwordMismatch);
      return;
    }
    setIsSavingPw(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwNotice(p.passwordChanged);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setPwError(status === 403 ? p.passwordWrongCurrent : p.passwordChangeFailed);
    } finally {
      setIsSavingPw(false);
    }
  };

  return (
    <section className="mochi-card-soft flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[color:var(--mochi-blue)]" />
          <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.accountSection}</h2>
        </div>
        <div className="flex items-center gap-2">
          {onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="mochi-btn-secondary inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
            >
              <UserRound className="w-4 h-4" /> {p.openProfile}
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="mochi-btn-secondary inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
          >
            <LogOut className="w-4 h-4" /> {p.signOut}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="mochi-meta">{p.displayNameLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={nameDraft ?? (user.displayName || user.username)}
            onChange={(e) => {
              setNameDraft(e.target.value);
              setNameNotice(null);
            }}
            maxLength={30}
            className="mochi-input flex-1 min-w-[180px] px-3 py-2 rounded-xl text-xs"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={isSavingName || nameDraft === null}
            className="mochi-btn-primary inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> {t.profile.saveName}
          </button>
        </div>
        {nameNotice && <p className="text-xs text-emerald-500">{nameNotice}</p>}
        {nameError && <p className="text-xs text-rose-400">{nameError}</p>}
      </div>

      <div className="mochi-divider" />

      <form onSubmit={savePassword} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[color:var(--mochi-blue)]" />
          <span className="text-xs font-bold text-[color:var(--mochi-text)]">{p.passwordSection}</span>
        </div>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={p.currentPassword}
          autoComplete="current-password"
          required
          className="mochi-input px-3 py-2 rounded-xl text-xs"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={p.newPassword}
            autoComplete="new-password"
            required
            minLength={6}
            className="mochi-input px-3 py-2 rounded-xl text-xs"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={p.confirmPassword}
            autoComplete="new-password"
            required
            minLength={6}
            className="mochi-input px-3 py-2 rounded-xl text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSavingPw}
            className="mochi-btn-primary inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" /> {p.changePasswordBtn}
          </button>
          {pwNotice && (
            <span className="mochi-chip">
              <Check className="w-3.5 h-3.5" /> {pwNotice}
            </span>
          )}
        </div>
        {pwError && <p className="text-xs text-rose-400">{pwError}</p>}
      </form>

      <div className="mochi-divider" />

      <EmailVerificationCard
        user={user}
        onUserUpdated={(u) => useAuthStore.getState().updateUser(u)}
      />
    </section>
  );
};

export default AccountSecurityCard;
