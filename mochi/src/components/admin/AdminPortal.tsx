// Tabbed Admin Backoffice Shell Coordinating Platform Telemetry, Users, Games, and Audit Logs

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  LayoutDashboard,
  Users,
  Gamepad2,
  ScrollText,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AdminApi, adminApi } from '../../api/admin';
import { AdminAuditLogItem, AdminPlatformStats, UserProfile } from '../../api/types';
import { AdminDashboard } from './AdminDashboard';
import { AdminUserManagement } from './AdminUserManagement';
import { AdminGameModeration } from './AdminGameModeration';
import { AdminAuditLogs } from './AdminAuditLogs';

export type AdminTabKey = 'dashboard' | 'users' | 'games' | 'audit';

export interface AdminPortalProps {
  currentUser: UserProfile;
  api?: AdminApi;
  onCatalogChanged?: () => void;
}

const AUDIT_LIMIT = 15;

// Top-level backoffice workspace accessible exclusively to verified platform administrators
export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentUser,
  api = adminApi,
  onCatalogChanged
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AdminTabKey>('dashboard');
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTelemetryAndLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.getStats(),
        api.listAuditLogs({ page: auditPage, limit: AUDIT_LIMIT })
      ]);
      setStats(statsRes.stats);
      setLogs(logsRes.logs);
      setLogsTotal(logsRes.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load admin telemetry');
    } finally {
      setIsLoading(false);
    }
  }, [api, auditPage]);

  useEffect(() => {
    void loadTelemetryAndLogs();
  }, [loadTelemetryAndLogs]);

  const tabs: { key: AdminTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'dashboard', label: t.admin.tabDashboard, icon: LayoutDashboard },
    { key: 'users', label: t.admin.tabUsers, icon: Users },
    { key: 'games', label: t.admin.tabGames, icon: Gamepad2 },
    { key: 'audit', label: t.admin.tabAudit, icon: ScrollText }
  ];

  return (
    <div className="flex-1 bg-slate-50 dark:bg-[#090b10] min-h-full p-6 transition-colors">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Backoffice Header */}
        <div className="rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-xl border border-slate-200 dark:border-white/[0.08] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-x-2 px-2.5 py-0.5 rounded-full bg-[#00a2ff]/15 border border-[#00a2ff]/30 text-[11px] font-mono font-bold text-[#00a2ff]">
              <Shield className="w-3.5 h-3.5" />
              <span>ADMINISTRATION // {currentUser.username.toUpperCase()}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {t.admin.title}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">{t.admin.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => void loadTelemetryAndLogs()}
            disabled={isLoading}
            className="self-start md:self-auto inline-flex items-center gap-x-2 px-4 py-2.5 rounded-xl bg-[#00a2ff] hover:bg-[#008ee0] text-white text-xs font-bold tracking-wide transition-colors shadow-lg shadow-[#00a2ff]/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t.admin.refresh}</span>
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#121621]/90 border border-slate-200 dark:border-white/[0.08] w-fit shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#00a2ff] text-white shadow-md shadow-[#00a2ff]/25'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Non-blocking Telemetry Error Banner */}
        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-center gap-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadTelemetryAndLogs()}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold"
            >
              {t.admin.refresh}
            </button>
          </div>
        )}

        {/* Active Backoffice Module */}
        {activeTab === 'dashboard' && (
          <AdminDashboard
            stats={stats}
            recentLogs={logs}
            isLoading={isLoading}
            onRefresh={() => void loadTelemetryAndLogs()}
            onViewAllLogs={() => setActiveTab('audit')}
          />
        )}

        {activeTab === 'users' && (
          <AdminUserManagement
            currentUserId={currentUser.id}
            api={api}
            onUserMutated={() => void loadTelemetryAndLogs()}
          />
        )}

        {activeTab === 'games' && (
          <AdminGameModeration
            api={api}
            onGameModerated={() => {
              void loadTelemetryAndLogs();
              onCatalogChanged?.();
            }}
          />
        )}

        {activeTab === 'audit' && (
          <AdminAuditLogs
            logs={logs}
            total={logsTotal}
            page={auditPage}
            limit={AUDIT_LIMIT}
            isLoading={isLoading}
            onPageChange={(nextPage) => setAuditPage(nextPage)}
            onRefresh={() => void loadTelemetryAndLogs()}
          />
        )}
      </div>
    </div>
  );
};

export default AdminPortal;
