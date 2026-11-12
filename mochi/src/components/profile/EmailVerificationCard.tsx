// User Profile Email Verification and Account Security Card
// Allows players who registered with instant onboarding to link and verify their email address later

import React, { useState } from 'react';
import { Mail, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authApi } from '../../api/auth';
import { UserProfile } from '../../api/types';
import { useAuthStore } from '../../store/useAuthStore';
import { useI18n } from '../../i18n/context';

export interface EmailVerificationCardProps {
  user: UserProfile;
  onUserUpdated?: (user: UserProfile) => void;
}

export const EmailVerificationCard: React.FC<EmailVerificationCardProps> = ({
  user,
  onUserUpdated
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'input_email' | 'enter_code'>('input_email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isPlaceholderEmail = user.email.endsWith('@game.lenout.com');
  const isVerified = Boolean(user.isVerified) && !isPlaceholderEmail;

  if (isVerified && !isExpanded) {
    return (
      <div className="flex items-center justify-between p-3.5 bg-slate-100/70 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs">
        <div className="flex items-center gap-2.5">
          <Mail className="w-4 h-4 text-[#38bdf8]" />
          <span className="font-mono text-slate-700 dark:text-slate-300">{user.email}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{t.profile.verifiedBadge}</span>
        </span>
      </div>
    );
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailInput.includes('@')) {
      setError(t.profile.invalidEmail);
      return;
    }
    setIsLoading(true);
    try {
      await authApi.requestEmailVerification(emailInput.trim());
      setStep('enter_code');
      setSuccessMsg(`${t.profile.codeSentTo} ${emailInput.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.profile.sendCodeFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otpCode.trim().length !== 6) {
      setError(t.profile.verifyCodeHint);
      return;
    }
    setIsLoading(true);
    try {
      const res = await authApi.confirmEmailVerification(emailInput.trim(), otpCode.trim());
      useAuthStore.getState().login(useAuthStore.getState().token || '', res.user);
      onUserUpdated?.(res.user);
      setIsExpanded(false);
      setSuccessMsg(t.profile.verifiedSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.profile.invalidCode);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-100/70 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/[0.08] rounded-2xl text-left space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#00a2ff]" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">{t.profile.securityTitle}</span>
        </div>
        {!isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-xs font-bold text-[#00a2ff] hover:underline"
          >
            {isPlaceholderEmail ? t.profile.addEmail : t.profile.changeEmail}
          </button>
        )}
      </div>

      {!isExpanded ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {isPlaceholderEmail
            ? t.profile.addEmailDesc
            : `${t.profile.linkedEmail} ${user.email}`}
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && !error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {step === 'input_email' ? (
            <form onSubmit={handleSendCode} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t.profile.emailPlaceholder}
                required
                className="mochi-input flex-1 px-3 py-2 rounded-xl text-xs"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="mochi-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 disabled:opacity-50"
              >
                {isLoading ? t.profile.sending : t.profile.sendCode}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmOtp} className="flex gap-2">
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder={t.profile.codePlaceholder}
                maxLength={6}
                required
                className="mochi-input flex-1 px-3 py-2 rounded-xl text-xs font-mono"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="mochi-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 disabled:opacity-50"
              >
                {isLoading ? t.auth.verifying : t.profile.verify}
              </button>
            </form>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setIsExpanded(false); setError(null); setSuccessMsg(null); }}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              {t.profile.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
