// Per-player scripted data cache for a game room. Data is loaded once when a
// player joins, mutated synchronously by Lua, and written back to D1 on a short
// debounce plus on disconnect.

import { loadPlayerData, writePlayerData } from '../services/playerDataDb';

type FlushScheduler = (task: Promise<void>) => void;

const DEBOUNCE_MS = 1200;
const MAX_DIRTY_KEYS = 24;

export class RoomPlayerData {
  private cache = new Map<string, Map<string, unknown>>();
  private dirty = new Map<string, Set<string>>();
  private loaded = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: D1Database | undefined,
    private readonly gameId: string,
    private readonly schedule: FlushScheduler = () => {},
    private readonly debounceMs = DEBOUNCE_MS
  ) {}

  public async load(playerId: string): Promise<void> {
    if (!this.gameId || this.loaded.has(playerId)) return;
    try {
      const data = await loadPlayerData(this.db, this.gameId, playerId);
      this.cache.set(playerId, new Map(Object.entries(data)));
      this.loaded.add(playerId);
    } catch {
      // Keep the player usable in memory even when D1 is unreachable.
      this.cache.set(playerId, new Map());
      this.loaded.add(playerId);
    }
  }

  public get(playerId: string, key: string): unknown {
    return this.cache.get(playerId)?.get(key) ?? null;
  }

  public set(playerId: string, key: string, value: unknown): void {
    if (!key) return;
    let values = this.cache.get(playerId);
    if (!values) {
      values = new Map();
      this.cache.set(playerId, values);
    }
    values.set(key, value);

    let keys = this.dirty.get(playerId);
    if (!keys) {
      keys = new Set();
      this.dirty.set(playerId, keys);
    }
    keys.add(key);

    if (keys.size >= MAX_DIRTY_KEYS) {
      void this.flushPlayer(playerId);
      return;
    }
    this.queueFlush();
  }

  public increment(playerId: string, key: string, delta: number): number {
    const current = Number(this.get(playerId, key) ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + delta;
    this.set(playerId, key, next);
    return next;
  }

  /** Writes one player's pending keys immediately. */
  public async flushPlayer(playerId: string): Promise<void> {
    const keys = this.dirty.get(playerId);
    if (!keys || keys.size === 0) return;

    const entries: Record<string, unknown> = {};
    for (const key of keys) {
      entries[key] = this.cache.get(playerId)?.get(key) ?? null;
    }
    this.dirty.delete(playerId);

    const task = writePlayerData(this.db, this.gameId, playerId, entries).catch(() => {});
    this.pending = this.pending.then(() => task);
    await task;
  }

  public async flushAll(): Promise<void> {
    for (const playerId of Array.from(this.dirty.keys())) {
      await this.flushPlayer(playerId);
    }
  }

  /** Flushes and forgets a player who left the room. */
  public drop(playerId: string): Promise<void> {
    return this.flushPlayer(playerId).then(() => {
      this.cache.delete(playerId);
      this.dirty.delete(playerId);
      this.loaded.delete(playerId);
    });
  }

  public isLoaded(playerId: string): boolean {
    return this.loaded.has(playerId);
  }

  private queueFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.schedule(this.flushAll());
    }, this.debounceMs);
  }
}
