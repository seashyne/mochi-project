// Immutable Administrative Audit Log Table View

import React from 'react';
import { ScrollText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AdminAuditLogItem } from '../../api/types';

export interface AdminAuditLogsProps {
  logs: AdminAuditLogItem[];
  total: number;
  page: number;
  limit: number;
  isLoading: boolean;
  onPageChange: (nextPage: number) => void;
  onRefresh: () => void;
}

// Formats JSON audit payloads into readable single-line key-value summaries
function summarizeDetails(raw: string): string {
  if (!raw) return '--';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(' | ');
    }
  } catch {
    // Plain text detail string
  }
  return raw;
}

function actionPillClass(action: string): string {
  const upper = action.toUpperCase();
  if (upper.includes('BAN') || upper.includes('REJECT') || upper.includes('SUSPEND')) {
    return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
  }
  if (upper.includes('PUBLISH') || upper.includes('APPROVE') || upper.includes('UNBAN')) {
    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
  }
  return 'bg-[#00a2ff]/15 border-[#00a2ff]/30 text-[#00a2ff]';
}

// Renders paginated, append-only security and moderation audit entries
export const AdminAuditLogs: React.FC<AdminAuditLogsProps> = ({
  logs,
  total,
  page,
  limit,
  isLoading,
  onPageChange,
  onRefresh
}) => {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return (
    <div className="rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <ScrollText className="w-4 h-4 text-[#00a2ff]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.admin.auditHeader}</h3>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-[11px] font-mono text-slate-700 dark:text-slate-400">
            {total.toLocaleString()}
          </span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t.admin.refresh}</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.02]">
              <th className="py-3 px-4 font-semibold">Timestamp</th>
              <th className="py-3 px-4 font-semibold">Admin</th>
              <th className="py-3 px-4 font-semibold">Action</th>
              <th className="py-3 px-4 font-semibold">Target</th>
              <th className="py-3 px-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-xs">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400 font-mono">
                  No administrative audit entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '--'}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {log.adminUsername || log.adminId}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold ${actionPillClass(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {log.targetType}:{log.targetId}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-md truncate">
                    {summarizeDetails(log.details)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono">
          Page {page} / {totalPages}
        </span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminAuditLogs;
