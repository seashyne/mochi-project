// Live game state for one session: scores, leaderboard entries and toast notifications.
// The HUD subscribes through useSyncExternalStore, so every Lua write shows up on screen.

import { HudNotification, HudSnapshot } from './types';

const MAX_NOTIFICATIONS = 4;
const MAX_LEADERBOARD_ROWS = 6;

export class GameState {
  private snapshot: HudSnapshot = { scores: {}, leaderboard: [], notifications: [] };
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private sequence = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): HudSnapshot => this.snapshot;

  addScore(category: string, amount: number): number {
    const key = String(category || 'Score');
    const delta = Number(amount);
    const next = (this.snapshot.scores[key] ?? 0) + (Number.isFinite(delta) ? delta : 0);
    this.snapshot = { ...this.snapshot, scores: { ...this.snapshot.scores, [key]: next } };
    this.emit();
    return next;
  }

  getScore(category: string): number {
    return this.snapshot.scores[String(category || 'Score')] ?? 0;
  }

  setScore(category: string, value: number): void {
    const key = String(category || 'Score');
    this.snapshot = { ...this.snapshot, scores: { ...this.snapshot.scores, [key]: Number(value) || 0 } };
    this.emit();
  }

  /** Upserts a leaderboard row and keeps the board sorted high-to-low. */
  setLeaderboard(category: string, score: number): void {
    const key = String(category || 'Score');
    const rows = this.snapshot.leaderboard.filter((row) => row.category !== key);
    rows.push({ category: key, score: Number(score) || 0 });
    rows.sort((a, b) => b.score - a.score);
    this.snapshot = { ...this.snapshot, leaderboard: rows.slice(0, MAX_LEADERBOARD_ROWS) };
    this.emit();
  }

  notify(message: string, durationSec = 2.4): void {
    const text = String(message ?? '').trim();
    if (!text) return;
    this.sequence += 1;
    const notification: HudNotification = { id: `toast_${this.sequence}`, message: text, at: Date.now() };
    const notifications = [...this.snapshot.notifications, notification].slice(-MAX_NOTIFICATIONS);
    this.snapshot = { ...this.snapshot, notifications };
    this.emit();

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.dismiss(notification.id);
    }, Math.max(0.5, Math.min(10, Number(durationSec) || 2.4)) * 1000);
    this.timers.add(timer);
  }

  dismiss(id: string): void {
    const notifications = this.snapshot.notifications.filter((item) => item.id !== id);
    if (notifications.length === this.snapshot.notifications.length) return;
    this.snapshot = { ...this.snapshot, notifications };
    this.emit();
  }

  reset(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.snapshot = { scores: {}, leaderboard: [], notifications: [] };
    this.emit();
  }

  dispose(): void {
    this.reset();
    this.listeners.clear();
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('GameState listener failed:', err);
      }
    });
  }
}
