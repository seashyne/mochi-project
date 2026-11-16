// Mochi Coins Wallet and Transaction Ledger History Modal

import React, { useEffect, useState } from 'react';
import { Coins, X, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';
import { Wallet, CoinLedgerEntry } from '../../api/shopTypes';
import { shopApi } from '../../api/shop';

export interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
  initialBalance?: number;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  token,
  initialBalance = 100
}) => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<CoinLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      shopApi.getWallet(token).catch(() => null),
      shopApi.getLedger(token).catch(() => [])
    ]).then(([w, l]) => {
      if (!isMounted) return;
      if (w) setWallet(w);
      if (l) setLedger(l);
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  if (!isOpen) return null;

  const currentBalance = wallet ? wallet.balance : initialBalance;
  const earnedBalance = wallet ? wallet.earnedBalance : 0;

  return (
    <div
      data-testid="wallet-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Mochi Wallet</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Currency & Economy Ledger</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Balance
            </span>
            <div className="flex items-center gap-1.5 text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              <Coins className="w-6 h-6 text-amber-500" />
              <span>{`${currentBalance.toLocaleString()} MC`}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Creator Revenue
            </span>
            <div className="flex items-center gap-1.5 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              <span>{`${earnedBalance.toLocaleString()} MC`}</span>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Recent Transactions</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Audit Ledger</span>
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 pe-1">
            {loading ? (
              <div className="text-center py-6 text-xs text-slate-500">Loading transactions...</div>
            ) : ledger.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">No transactions recorded yet.</div>
            ) : (
              ledger.map((entry) => {
                const isPositive = entry.delta > 0;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {isPositive ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      </div>
                      <div className="truncate max-w-[180px]">
                        <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{entry.reason}</p>
                        <p className="text-[10px] text-slate-500">{new Date(entry.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isPositive ? `+${entry.delta}` : entry.delta} MC
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mochi-btn-secondary w-full py-2.5 rounded-xl text-xs font-semibold"
        >
          Close
        </button>
      </div>
    </div>
  );
};
