// Admin Backoffice Overview Dashboard with Platform Telemetry Cards and Recent Audit Activity

import React from 'react';
import {
  Activity,
  Gamepad2,
  Users,
  Zap,
  RefreshCw,
  ScrollText,
  ArrowUpRight
} from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AdminAuditLogItem, AdminPlatformStats } from '../../api/types';

export interface AdminDashboardProps {
  stats: AdminPlatformStats | null;
  recentLogs: AdminAuditLogItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onViewAllLogs: () => void;
}

function formatTimestamp(iso: string): string {
  if (!iso) return '--';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

// Displays live platform KPI cards and latest administrative audit events
export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  stats,
  recentLogs,
  isLoading,
  onRefresh,
  onViewAllLogs
}) => {
  const { t } = useI18n();

  const cards = [
    {
      key: 'online',
      label: t.admin.onlineUsers,
      value: (stats?.activeOnlineUsers ?? 0).toLocaleString(),
      icon: Activity,
      accent: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/15 border-emerald-500/30',
      glow: 'shadow-emerald-500/10',
      liveDot: true
    },
    {
      key: 'plays',
      label: t.admin.totalPlays,
      value: (stats?.totalGameplaySessions ?? 0).toLocaleString(),
      icon: Zap,
      accent: 'text-[#00a2ff]',
      badgeBg: 'bg-[#00a2ff]/15 border-[#00a2ff]/30',
      glow: 'shadow-[#00a2ff]/10',
      liveDot: false
    },
    {
      key: 'games',
      label: t.admin.totalGames,
      value: (stats?.totalGames ?? 0).toLocaleString(),
      icon: Gamepad2,
      accent: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/15 border-indigo-500/30',
      glow: 'shadow-indigo-500/10',
      liveDot: false
    },
    {
      key: 'users',
      label: t.admin.registeredUsers,
      value: (stats?.totalRegisteredUsers ?? 0).toLocaleString(),
      icon: Users,
      accent: 'text-amber-400',
      badgeBg: 'bg-amber-500/15 border-amber-500/30',
      glow: 'shadow-amber-500/10',
      liveDot: false
    }
  ];

  return (
    <div className="space-y-6">
      {/* 4 Glowing Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className={`rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] p-5 shadow-xl ${card.glow} flex flex-col justify-between transition-colors hover:border-slate-300 dark:hover:border-white/[0.15]`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-xl border ${card.badgeBg} flex items-center justify-center`}
                >
                  <Icon className={`w-5 h-5 ${card.accent}`} />
                </div>

                {card.liveDot && (
                  <span className="inline-flex items-center gap-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>LIVE</span>
                  </span>
                )}
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                  {card.value}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Recent Audit Activity Summary */}
      <div className="rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-x-2.5">
            <ScrollText className="w-4 h-4 text-[#00a2ff]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.admin.auditHeader}</h3>
          </div>

          <div className="flex items-center gap-x-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t.admin.refresh}</span>
            </button>

            <button
              type="button"
              onClick={onViewAllLogs}
              className="inline-flex items-center gap-x-1 px-3 py-1.5 rounded-lg bg-[#00a2ff]/15 hover:bg-[#00a2ff]/25 border border-[#00a2ff]/30 text-xs font-semibold text-[#00a2ff] transition-colors"
            >
              <span>{t.admin.tabAudit}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {recentLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
            No administrative audit events recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {recentLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-x-3 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-[#00a2ff]/15 border border-[#00a2ff]/30 text-[10px] font-mono font-bold text-[#00a2ff] shrink-0">
                    {log.action}
                  </span>
                  <span className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate">
                    {log.adminUsername || log.adminId}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    [{log.targetType}:{log.targetId}]
                  </span>
                </div>

                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {formatTimestamp(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
