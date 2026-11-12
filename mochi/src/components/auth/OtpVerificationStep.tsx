// Glassmorphic 6-Digit Email OTP Verification Step
// Handles auto-advancing numeric digit boxes, clipboard paste, 15-minute expiry timer, and 60s resend cooldown

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, RotateCw, ShieldCheck, Clock } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { authApi } from '../../api/auth';
import { UserProfile } from '../../api/types';
import { useAuthStore } from '../../store/useAuthStore';

export interface OtpVerificationStepProps {
  email: string;
  onSuccess: (user: UserProfile) => void;
  onBack: () => void;
}

export const OtpVerificationStep: React.FC<OtpVerificationStepProps> = ({
  email,
  onSuccess,
  onBack
}) => {
  const { t } = useI18n();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60);
  const [resendCooldown, setResendCooldown] = useState<number>(60);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first OTP cell automatically when mounted
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // 15-minute OTP validity countdown
  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  // 60-second resend rate-limit cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const triggerVerification = async (codeToVerify?: string) => {
    const code = codeToVerify || digits.join('');
    if (code.length !== 6) {
      setError(t.auth.otpPlaceholder);
      return;
    }
    if (timeLeft <= 0) {
      setError(t.auth.codeExpired);
      return;
    }

    setIsVerifying(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await authApi.verifyOtp(email, code);
      if (res && res.user) {
        if (res.token) {
          useAuthStore.getState().login(res.token, res.user);
        }
        onSuccess(res.user);
      } else {
        setError(t.auth.invalidOtp);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.auth.invalidOtp;
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const numericChar = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = numericChar;
    setDigits(newDigits);
    setError(null);

    if (numericChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (numericChar && index === 5 && newDigits.every((d) => d.length === 1)) {
      triggerVerification(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setDigits(newDigits);
    setError(null);

    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      triggerVerification(pasted);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await authApi.resendOtp(email);
      setInfoMessage(res.message || t.auth.codeResent);
      setResendCooldown(60);
      setTimeLeft(15 * 60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.auth.failed;
      setError(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Verification Shield Header */}
      <div className="text-center space-y-1.5">
        <div className="w-11 h-11 mx-auto rounded-2xl bg-[#00a2ff]/12 border border-[#00a2ff]/30 flex items-center justify-center text-[#38bdf8] shadow-mochi-cyan mb-2">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t.auth.verifyEmailTitle}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">{t.auth.verifyEmailDesc}</p>
        <div className="inline-block px-3 py-1 rounded-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs font-mono font-semibold text-[#00a2ff] dark:text-[#38bdf8] max-w-full truncate">
          {email}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {infoMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* 6-Digit Monospace Neon OTP Cells */}
      <div className="flex justify-center gap-2 sm:gap-2.5 py-2" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={isVerifying}
            className={`mochi-auth-otp ${digit ? 'mochi-auth-otp-filled' : ''}`}
          />
        ))}
      </div>

      {/* Countdown Status Strip */}
      <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#090b10]/70 border border-slate-200 dark:border-white/[0.07] text-[11px] text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>{t.auth.expiresIn}</span>
        </span>
        <span
          className={`font-mono font-bold ${
            timeLeft < 120 ? 'text-rose-400' : 'text-emerald-500 dark:text-emerald-300'
          }`}
        >
          {formatTimer(timeLeft)}
        </span>
      </div>

      {/* Primary Verify CTA & Secondary Navigation */}
      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={() => triggerVerification()}
          disabled={isVerifying || digits.some((d) => !d) || timeLeft <= 0}
          className="mochi-btn-primary w-full py-3 rounded-xl text-xs font-bold tracking-wide disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isVerifying ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t.auth.verifying}</span>
            </>
          ) : (
            <span>{t.auth.verifyBtn}</span>
          )}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.auth.backToSignIn}</span>
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending}
            className="text-xs font-bold text-[#38bdf8] hover:text-white disabled:text-slate-500 disabled:cursor-not-allowed transition-colors font-mono"
          >
            {resendCooldown > 0
              ? `${t.auth.resendWait} ${resendCooldown}s`
              : t.auth.resendCode}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OtpVerificationStep;
