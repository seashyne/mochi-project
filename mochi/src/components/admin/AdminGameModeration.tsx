// Admin Game Content Moderation View with Status Filters, Publish/Reject, and Featured Star

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Star,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AdminApi, adminApi } from '../../api/admin';
import { AdminGameItem } from '../../api/types';

export interface AdminGameModerationProps {
  api?: AdminApi;
  onGameModerated?: () => void;
}

type StatusFilter = 'all' | 'draft' | 'published' | 'rejected';
const PAGE_LIMIT = 10;

function statusBadgeStyle(status: AdminGameItem['status']): string {
  if (status === 'published') {
    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
  }
  if (status === 'rejected') {
    return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
  }
  return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
}

// Enables moderators to review submitted 3D worlds, approve/unpublish, and curate featured picks
export const AdminGameModeration: React.FC<AdminGameModerationProps> = ({
  api = adminApi,
  onGameModerated
}) => {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [games, setGames] = useState<AdminGameItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchGames = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listGames({
        query: debouncedQuery,
        status: statusFilter,
        page,
        limit: PAGE_LIMIT
      });
      setGames(res.games);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setIsLoading(false);
    }
  }, [api, debouncedQuery, statusFilter, page]);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  const handleModerate = async (
    game: AdminGameItem,
    updates: {
      status?: 'draft' | 'published' | 'rejected' | 'archived';
      isFeatured?: boolean;
    }
  ) => {
    const snapshot = games;
    setBusyGameId(game.id);
    setError(null);
    setGames((prev) =>
      prev.map((g) => (g.id === game.id ? { ...g, ...updates } : g))
    );
    try {
      const res = await api.moderateGame(game.id, updates);
      setGames((prev) => prev.map((g) => (g.id === game.id ? res.game : g)));
      onGameModerated?.();
    } catch (err: unknown) {
      setGames(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to moderate game');
    } finally {
      setBusyGameId(null);
    }
  };

  const filters: StatusFilter[] = ['all', 'draft', 'published', 'rejected'];

  return (
    <div className="rounded-2xl bg-white dark:bg-[#121621]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-sm">
      {/* Filter & Search Bar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setStatusFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-colors ${
                statusFilter === f
                  ? 'bg-[#00a2ff]/20 border-[#00a2ff]/40 text-[#00a2ff]'
                  : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.admin.gameSearchPlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-xl bg-slate-100 dark:bg-[#090b10] border border-slate-200 dark:border-white/[0.08] focus:border-[#00a2ff] text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void fetchGames()}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Moderation Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.02]">
              <th className="py-3 px-4 font-semibold">{t.studio.worldTitle}</th>
              <th className="py-3 px-4 font-semibold">{t.catalog.plays}</th>
              <th className="py-3 px-4 font-semibold">{t.admin.status}</th>
              <th className="py-3 px-4 font-semibold">{t.admin.featured}</th>
              <th className="py-3 px-4 font-semibold text-end">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-xs">
            {games.map((g) => {
              const isBusy = busyGameId === g.id;
              return (
                <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white">{g.title}</div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      /{g.slug} | {g.creatorName || g.creatorId}
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-300">
                    {g.playCount.toLocaleString()}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${statusBadgeStyle(
                        g.status
                      )}`}
                    >
                      {g.status}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleModerate(g, { isFeatured: !g.isFeatured })}
                      className={`inline-flex items-center gap-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        g.isFeatured
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          g.isFeatured ? 'fill-amber-400 text-amber-400' : ''
                        }`}
                      />
                      <span>{g.isFeatured ? t.admin.featured : t.admin.feature}</span>
                    </button>
                  </td>

                  <td className="py-3 px-4 text-end">
                    <div className="inline-flex items-center gap-x-2">
                      {g.status !== 'published' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleModerate(g, { status: 'published' })}
                          className="inline-flex items-center gap-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.admin.approve}</span>
                        </button>
                      )}

                      {g.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleModerate(g, { status: 'rejected' })}
                          className="inline-flex items-center gap-x-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t.admin.unpublish}</span>
                        </button>
                      )}
                    </div>
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
        <div className="flex items-center gap-x-2">
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

export default AdminGameModeration;
