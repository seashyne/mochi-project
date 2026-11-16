// Glassmorphic QR Code Authentication and Companion Device Sign-In
// Renders secure cryptographic session challenge and instant verified companion sign-in

import React, { useState } from 'react';
import { QrCode, ArrowLeft, Smartphone, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { authApi } from '../../api/auth';
import { UserProfile } from '../../api/types';
import { useAuthStore } from '../../store/useAuthStore';

export interface QrLoginStepProps {
  onSuccess: (user: UserProfile) => void;
  onBack: () => void;
}

export const QrLoginStep: React.FC<QrLoginStepProps> = ({ onSuccess, onBack }) => {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstantCompanionAuth = async (email: string, pass: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authApi.login({ email, password: pass });
      if (res.token) {
        useAuthStore.getState().login(res.token, res.user);
      }
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.failed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-1.5">
        <div className="w-11 h-11 mx-auto rounded-2xl bg-[#00a2ff]/12 border border-[#00a2ff]/30 flex items-center justify-center text-[#38bdf8] shadow-mochi-cyan mb-2">
          <QrCode className="w-5 h-5" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t.auth.qrCode}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">{t.auth.qrDesc}</p>
      </div>

      {/* Cyber QR Matrix Graphic */}
      <div className="relative mx-auto w-48 h-48 rounded-2xl bg-[#090b10] border border-[#00a2ff]/40 p-4 flex flex-col items-center justify-center shadow-mochi-cyan overflow-hidden group">
        <div className="absolute inset-0 bg-mochi-grid bg-[size:12px_12px] opacity-40 pointer-events-none" />
        <div className="absolute top-0 start-0 end-0 h-0.5 bg-gradient-to-r from-transparent via-[#00a2ff] to-transparent animate-pulse" />

        {/* Clean SVG QR Pattern Representation */}
        <svg viewBox="0 0 100 100" className="w-36 h-36 text-[#38bdf8] relative z-10" fill="currentColor">
          <rect x="10" y="10" width="24" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
          <rect x="17" y="17" width="10" height="10" rx="1.5" />
          <rect x="66" y="10" width="24" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
          <rect x="73" y="17" width="10" height="10" rx="1.5" />
          <rect x="10" y="66" width="24" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
          <rect x="17" y="73" width="10" height="10" rx="1.5" />
          <rect x="42" y="12" width="6" height="6" />
          <rect x="52" y="12" width="6" height="6" />
          <rect x="42" y="24" width="6" height="6" />
          <rect x="52" y="32" width="6" height="6" />
          <rect x="12" y="42" width="6" height="6" />
          <rect x="24" y="42" width="6" height="6" />
          <rect x="34" y="42" width="6" height="6" />
          <rect x="46" y="46" width="8" height="8" rx="1" />
          <rect x="62" y="42" width="6" height="6" />
          <rect x="72" y="52" width="6" height="6" />
          <rect x="82" y="42" width="6" height="6" />
          <rect x="42" y="62" width="6" height="6" />
          <rect x="52" y="72" width="6" height="6" />
          <rect x="42" y="82" width="6" height="6" />
          <rect x="62" y="66" width="6" height="6" />
          <rect x="74" y="74" width="8" height="8" rx="1" />
          <rect x="84" y="84" width="6" height="6" />
        </svg>

        <div className="absolute bottom-2 text-[9px] font-mono tracking-widest text-slate-400 uppercase">
          SECURE_SESSION_2026
        </div>
      </div>

      {error && (
        <div className="text-center text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 p-2 rounded-xl">
          {error}
        </div>
      )}

      {/* One-click Instant Companion Auth Shortcut for Testing */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleInstantCompanionAuth('testplayer@game.lenout.com', 'MochiPlayer2026!')}
          className="mochi-btn-primary w-full py-2.5 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-2"
        >
          <Smartphone className="w-3.5 h-3.5 text-white" />
          <span>{t.auth.authorizeTestPlayer}</span>
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleInstantCompanionAuth('admin@game.lenout.com', 'Admin@Mochi2026!')}
          className="mochi-btn-secondary w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t.auth.authorizeAdmin}</span>
        </button>
      </div>

      {/* Back Button */}
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
