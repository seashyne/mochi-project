// Admin User Governance Table with Search, Role Assignment, Coin Editor, and Suspension Toggle

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Coins,
  Ban,
  CheckCircle2,
  Save,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AdminApi, adminApi } from '../../api/admin';
import { AdminUserItem } from '../../api/types';

export interface AdminUserManagementProps {
  currentUserId: string;
  api?: AdminApi;
  onUserMutated?: () => void;
}

const PAGE_LIMIT = 10;

// Provides paginated account directory with optimistic RBAC role, coin balance, and ban controls
export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({
  currentUserId,
  api = adminApi,
  onUserMutated
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [coinDrafts, setCoinDrafts] = useState<Record<string, string>>({});

  // Debounce search input to prevent excessive network queries while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listUsers({ query: debouncedQuery, page, limit: PAGE_LIMIT });
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(Math.max(1, res.totalPages));
      const drafts: Record<string, string> = {};
      for (const u of res.users) {
        drafts[u.id] = String(u.coins);
      }
      setCoinDrafts(drafts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [api, debouncedQuery, page]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const applyUserPatch = async (
    target: AdminUserItem,
    updates: { isBanned?: boolean; coins?: number; role?: 'player' | 'creator' | 'admin' }
  ) => {
    const snapshot = users;
    setBusyUserId(target.id);
    setError(null);
    // Optimistically reflect change in table row
    setUsers((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, ...updates } : u))
    );
    try {
      const res = await api.updateUser(target.id, updates);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? res.user : u)));
      setCoinDrafts((prev) => ({ ...prev, [target.id]: String(res.user.coins) }));
      onUserMutated?.();
    } catch (err: unknown) {
      setUsers(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveCoins = (target: AdminUserItem) => {
    const raw = coinDrafts[target.id] ?? String(target.coins);
    const parsed = Math.max(0, Math.floor(Number(raw) || 0));
    void applyUserPatch(target, { coins: parsed });
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.admin.userSearchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-[#090b10] border border-slate-200 dark:border-white/[0.08] focus:border-[#00a2ff] text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {total.toLocaleString()} {t.admin.tabUsers}
          </span>
          <button
            type="button"
            onClick={() => void fetchUsers()}
            disabled={isLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t.admin.refresh}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* User Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.02]">
              <th className="py-3 px-4 font-semibold">{t.auth.username}</th>
              <th className="py-3 px-4 font-semibold">{t.admin.role}</th>
              <th className="py-3 px-4 font-semibold">{t.admin.coins}</th>
              <th className="py-3 px-4 font-semibold">{t.admin.status}</th>
              <th className="py-3 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-xs">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const isBusy = busyUserId === u.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00a2ff] to-indigo-600 flex items-center justify-center text-xs font-bold text-white border border-white/20 shrink-0">
                        {(u.displayName?.[0] || u.username[0] || 'U').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {u.displayName || u.username}{' '}
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            #{u.numericId}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <select
                      aria-label={`${t.admin.role} ${u.username}`}
                      value={u.role}
                      disabled={isBusy || isSelf}
                      onChange={(e) =>
                        void applyUserPatch(u, {
                          role: e.target.value as 'player' | 'creator' | 'admin'
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#090b10] border border-slate-200 dark:border-white/[0.1] text-xs text-slate-900 dark:text-white focus:border-[#00a2ff] focus:outline-none disabled:opacity-50"
                    >
                      <option value="player">player</option>
                      <option value="creator">creator</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>

                  <td className="py-3 px-4">
                    <div className="inline-flex items-center space-x-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <input
                        type="number"
                        min={0}
                        value={coinDrafts[u.id] ?? String(u.coins)}
                        onChange={(e) =>
                          setCoinDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        className="w-24 px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#090b10] border border-slate-200 dark:border-white/[0.1] text-xs font-mono text-amber-600 dark:text-amber-300 focus:border-[#00a2ff] focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSaveCoins(u)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-[#00a2ff]/15 hover:bg-[#00a2ff]/25 border border-[#00a2ff]/30 text-[11px] font-semibold text-[#00a2ff] transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" />
                        <span>{t.admin.save}</span>
                      </button>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    {u.isBanned ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[11px] font-semibold text-rose-300">
                        <Ban className="w-3 h-3" />
                        <span>{t.admin.suspended}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t.admin.active}</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      disabled={isBusy || isSelf}
                      onClick={() => void applyUserPatch(u, { isBanned: !u.isBanned })}
                      className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
                        u.isBanned
                          ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <span>{u.isBanned ? t.admin.unban : t.admin.ban}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono">
          Page {page} / {totalPages}
        </span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminUserManagement;
