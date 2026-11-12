// Glassmorphic Password Reset and Recovery Step
// Requests a 6-digit OTP code to the user's real email, then updates the password in Cloudflare D1

import React, { useState } from 'react';
import { KeyRound, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { authApi } from '../../api/auth';
import { UserProfile } from '../../api/types';
import { useAuthStore } from '../../store/useAuthStore';

export interface ForgotPasswordStepProps {
  initialEmail?: string;
  onSuccess: (user: UserProfile) => void;
  onBack: () => void;
}

export const ForgotPasswordStep: React.FC<ForgotPasswordStepProps> = ({
  initialEmail = '',
  onSuccess,
  onBack
}) => {
  const { t } = useI18n();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState<string>(initialEmail);
  const [code, setCode] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(t.auth.email);
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await authApi.forgotPassword(cleanEmail);
      setInfoMessage(res.message || t.auth.resetCodeSent);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.failed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (cleanCode.length < 6) {
      setError(t.auth.otpPlaceholder);
      return;
    }
    if (newPassword.length < 6) {
      setError(t.auth.password);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authApi.resetPassword({
        email: email.trim().toLowerCase(),
        code: cleanCode,
        newPassword
      });
      if (res && res.user) {
        if (res.token) {
          useAuthStore.getState().login(res.token, res.user);
        }
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.failed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Step Header */}
      <div className="text-center space-y-1.5">
        <div className="w-11 h-11 mx-auto rounded-2xl bg-[#00a2ff]/12 border border-[#00a2ff]/30 flex items-center justify-center text-[#38bdf8] shadow-mochi-cyan mb-2">
          <KeyRound className="w-5 h-5" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          {step === 'request' ? t.auth.forgotPassword : t.auth.verifyEmailTitle}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {step === 'request' ? t.auth.forgotDescRequest : t.auth.forgotDescReset}
        </p>
      </div>

      {infoMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'request' ? (
        <form onSubmit={handleRequestCode} className="space-y-3">
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.email}
              required
              autoFocus
              className="mochi-input w-full pl-10 pr-3.5 py-2.5 rounded-xl text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mochi-btn-primary w-full py-3 rounded-xl text-xs font-bold tracking-wide disabled:opacity-50"
          >
            {isLoading ? t.auth.verifying : t.auth.sendResetCode}
          </button>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-3">
          <div className="text-center text-xs font-mono text-[#38bdf8] bg-white/[0.04] p-2 rounded-xl border border-white/10 truncate">
            {email}
          </div>

          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t.auth.otpPlaceholder}
              required
              maxLength={6}
              autoFocus
              className="mochi-input w-full pl-10 pr-3.5 py-2.5 rounded-xl text-xs font-mono tracking-widest text-center"
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.auth.newPasswordPlaceholder}
              required
              minLength={6}
              className="mochi-input w-full pl-10 pr-10 py-2.5 rounded-xl text-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mochi-btn-primary w-full py-3 rounded-xl text-xs font-bold tracking-wide disabled:opacity-50"
          >
            {isLoading ? t.auth.verifying : t.auth.resetPasswordBtn}
          </button>
        </form>
      )}

      {/* Back Navigation Button */}
      <button
        type="button"
        onClick={onBack}
        className="w-full py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5 transition-colors pt-2 border-t border-slate-200 dark:border-white/[0.06]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t.auth.backToSignIn}</span>
      </button>
    </div>
  );
};
