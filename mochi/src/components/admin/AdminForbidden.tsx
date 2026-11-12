// 403 Access Denied View for Unauthorized /admin Route Requests

import React from 'react';
import { ShieldAlert, ArrowLeft, LogIn, Lock } from 'lucide-react';
import { useI18n } from '../../i18n/context';

export interface AdminForbiddenProps {
  isAuthenticated: boolean;
  onReturnHome: () => void;
  onOpenSignIn: () => void;
}

// Renders strict RBAC rejection boundary when unauthenticated or non-admin accounts visit /admin
export const AdminForbidden: React.FC<AdminForbiddenProps> = ({
  isAuthenticated,
  onReturnHome,
  onOpenSignIn
}) => {
  const { t } = useI18n();

  return (
    <div className="flex-1 bg-slate-50 dark:bg-[#090b10] flex items-center justify-center p-6 min-h-[calc(100vh-120px)] transition-colors">
      <div className="relative max-w-md w-full rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-xl border border-slate-200 dark:border-white/[0.08] p-8 text-center shadow-2xl overflow-hidden">
        {/* Subtle top security accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500/80 via-amber-400/80 to-[#00a2ff]/80" />

        {/* Shield Lock Emblem */}
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center relative shadow-lg shadow-rose-500/10">
          <ShieldAlert className="w-8 h-8 text-rose-400" />
          <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-slate-100 dark:bg-[#090b10] border border-slate-200 dark:border-white/10 flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </span>
        </div>

        {/* HTTP 403 Telemetry Pill */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono font-bold tracking-wider text-rose-600 dark:text-rose-300 mb-4">
          <span>HTTP 403</span>
          <span className="text-slate-300 dark:text-white/25">/</span>
          <span>RBAC PROTECTED</span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          {t.admin.accessDeniedTitle}
        </h1>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-7">
          {t.admin.accessDeniedDesc}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onOpenSignIn}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-[#00a2ff] hover:bg-[#008ee0] text-white text-xs font-bold tracking-wide transition-colors shadow-lg shadow-[#00a2ff]/20"
            >
              <LogIn className="w-4 h-4" />
              <span>{t.nav.signIn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onReturnHome}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#00a2ff]" />
            <span>{t.admin.returnHome}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminForbidden;
