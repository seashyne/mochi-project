// Wallet and Coin Ledger Database Service for Mochi Coins (MC) Economy

import {
  Wallet,
  WalletRow,
  CoinLedgerEntry,
  CoinLedgerRow,
  mapWalletRow,
  mapCoinLedgerRow
} from '../models/shop';

export async function getOrCreateWallet(db: D1Database, userId: string): Promise<Wallet> {
  const existing = await db
    .prepare('SELECT * FROM wallets WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<WalletRow>();

  if (existing) {
    return mapWalletRow(existing);
  }

  const now = new Date().toISOString();
  const initialBalance = 100;

  await db
    .prepare(
      'INSERT OR IGNORE INTO wallets (user_id, balance, earned_balance, updated_at) VALUES (?, ?, ?, ?)'
    )
    .bind(userId, initialBalance, 0, now)
    .run();

  // Create initial bonus ledger entry
  const ledgerId = `led_init_${crypto.randomUUID().slice(0, 12)}`;
  await db
    .prepare(
      `INSERT OR IGNORE INTO coin_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(ledgerId, userId, initialBalance, initialBalance, 'Welcome Starter Bonus', null, now)
    .run();

  const created = await db
    .prepare('SELECT * FROM wallets WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<WalletRow>();

  return created ? mapWalletRow(created) : { userId, balance: initialBalance, earnedBalance: 0, updatedAt: now };
}

export async function getLedgerEntries(
  db: D1Database,
  userId: string,
  limit = 50
): Promise<CoinLedgerEntry[]> {
  const rows = await db
    .prepare('SELECT * FROM coin_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, Math.min(Math.max(limit, 1), 100))
    .all<CoinLedgerRow>();

  return (rows.results || []).map(mapCoinLedgerRow);
}

export async function creditCoins(
  db: D1Database,
  userId: string,
  amount: number,
  reason: string,
  refId?: string,
  isEarned = false
): Promise<{ wallet: Wallet; ledgerEntry: CoinLedgerEntry }> {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive');
  }

  const wallet = await getOrCreateWallet(db, userId);
  const now = new Date().toISOString();
  const newBalance = wallet.balance + amount;
  const newEarned = isEarned ? wallet.earnedBalance + amount : wallet.earnedBalance;

  await db
    .prepare('UPDATE wallets SET balance = ?, earned_balance = ?, updated_at = ? WHERE user_id = ?')
    .bind(newBalance, newEarned, now, userId)
    .run();

  const ledgerId = `led_${crypto.randomUUID().slice(0, 16)}`;
  await db
    .prepare(
      `INSERT INTO coin_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(ledgerId, userId, amount, newBalance, reason, refId || null, now)
    .run();

  const ledgerEntry: CoinLedgerEntry = {
    id: ledgerId,
    userId,
    delta: amount,
    balanceAfter: newBalance,
    reason,
    refId: refId || null,
    createdAt: now
  };

  return {
    wallet: { userId, balance: newBalance, earnedBalance: newEarned, updatedAt: now },
    ledgerEntry
  };
}

export async function debitCoins(
  db: D1Database,
  userId: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<{ wallet: Wallet; ledgerEntry: CoinLedgerEntry }> {
  if (amount <= 0) {
    throw new Error('Debit amount must be positive');
  }

  const wallet = await getOrCreateWallet(db, userId);
  if (wallet.balance < amount) {
    throw new Error(`Insufficient funds: required ${amount} MC, current balance ${wallet.balance} MC`);
  }

  const now = new Date().toISOString();
  const newBalance = wallet.balance - amount;

  await db
    .prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?')
    .bind(newBalance, now, userId)
    .run();

  const ledgerId = `led_${crypto.randomUUID().slice(0, 16)}`;
  await db
    .prepare(
      `INSERT INTO coin_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(ledgerId, userId, -amount, newBalance, reason, refId || null, now)
    .run();

  const ledgerEntry: CoinLedgerEntry = {
    id: ledgerId,
    userId,
    delta: -amount,
    balanceAfter: newBalance,
    reason,
    refId: refId || null,
    createdAt: now
  };

  return {
    wallet: { userId, balance: newBalance, earnedBalance: wallet.earnedBalance, updatedAt: now },
    ledgerEntry
  };
}
