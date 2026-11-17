// Account management: display name, password rotation, email verification, session controls

import React, { useId, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, LogOut, User, UserRound } from 'lucide-react';
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
  const baseId = useId();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
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

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <section className="mochi-card-soft flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="mochi-icon-badge">
            <User className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[color:var(--mochi-text)]">{p.accountSection}</h2>
            <p className="text-[11px] text-[color:var(--mochi-text-sub)]">{p.securityOverviewHint}</p>
          </div>
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

      <form onSubmit={saveName} className="flex flex-col gap-2 max-w-xl">
        <label htmlFor={`${baseId}-display-name`} className="mochi-meta">
          {p.displayNameLabel}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${baseId}-display-name`}
            name="displayName"
            type="text"
            autoComplete="nickname"
            value={nameDraft ?? (user.displayName || user.username)}
            onChange={(e) => {
              setNameDraft(e.target.value);
              setNameNotice(null);
            }}
            maxLength={30}
            className="mochi-input flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl text-xs"
          />
          <button
            type="submit"
            disabled={isSavingName || nameDraft === null}
            className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> {t.profile.saveName}
          </button>
        </div>
        {nameNotice && <p role="status" className="text-xs text-emerald-500">{nameNotice}</p>}
        {nameError && <p role="alert" className="text-xs text-rose-400">{nameError}</p>}
      </form>

      <div className="mochi-divider" />

      <form onSubmit={savePassword} className="flex flex-col gap-3 max-w-xl">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[color:var(--mochi-blue)]" />
          <span className="text-xs font-bold text-[color:var(--mochi-text)]">{p.passwordSection}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${baseId}-current-pw`} className="mochi-meta">{p.currentPassword}</label>
          <div className="relative">
            <input
              id={`${baseId}-current-pw`}
              name="currentPassword"
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={p.currentPassword}
              autoComplete="current-password"
              required
              className="mochi-input w-full ps-3.5 pe-10 py-2.5 rounded-xl text-xs"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw((v) => !v)}
              aria-pressed={showCurrentPw}
              aria-label={`${showCurrentPw ? p.hidePassword : p.showPassword} (${p.currentPassword})`}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[color:var(--mochi-text-sub)] hover:text-[color:var(--mochi-text)]"
            >
              {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${baseId}-new-pw`} className="mochi-meta">{p.newPassword}</label>
            <div className="relative">
              <input
                id={`${baseId}-new-pw`}
                name="newPassword"
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={p.newPassword}
                autoComplete="new-password"
                required
                minLength={6}
                className="mochi-input w-full ps-3.5 pe-10 py-2.5 rounded-xl text-xs"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                aria-pressed={showNewPw}
                aria-label={`${showNewPw ? p.hidePassword : p.showPassword} (${p.newPassword})`}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[color:var(--mochi-text-sub)] hover:text-[color:var(--mochi-text)]"
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${baseId}-confirm-pw`} className="mochi-meta">{p.confirmPassword}</label>
            <div className="relative">
              <input
                id={`${baseId}-confirm-pw`}
                name="confirmPassword"
                type={showConfirmPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={p.confirmPassword}
                autoComplete="new-password"
                required
                minLength={6}
                className="mochi-input w-full ps-3.5 pe-10 py-2.5 rounded-xl text-xs"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                aria-pressed={showConfirmPw}
                aria-label={`${showConfirmPw ? p.hidePassword : p.showPassword} (${p.confirmPassword})`}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[color:var(--mochi-text-sub)] hover:text-[color:var(--mochi-text)]"
              >
                {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={isSavingPw}
            className="mochi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" /> {p.changePasswordBtn}
          </button>
          {pwNotice && (
            <span role="status" className="mochi-chip">
              <Check className="w-3.5 h-3.5" /> {pwNotice}
            </span>
          )}
        </div>
        {pwError && <p role="alert" className="text-xs text-rose-400">{pwError}</p>}
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
