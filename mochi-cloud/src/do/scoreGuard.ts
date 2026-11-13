// Baseline score sanity for replicated state.
//
// A client that can write its own leaderboard entry can write any number. The room
// does not know the rules of a game, but it does know that a score cannot be
// negative, infinite, or grow by a million points in one second.

export interface ScoreLimits {
  maxValue: number;
  /** Largest increase allowed per second for one player's score. */
  maxGainPerSecond: number;
  /** Keys that carry a score. Anything else is relayed untouched. */
  keys: string[];
}

export const DEFAULT_SCORE_LIMITS: ScoreLimits = {
  maxValue: 1_000_000,
  maxGainPerSecond: 10_000,
  keys: ['score', 'coins', 'points', 'leaderboard']
};

export type ScoreVerdict =
  | { ok: true; value: number }
  | { ok: false; value: number; reason: 'non-finite' | 'negative' | 'ceiling' | 'rate' };

const isScoreKey = (key: string, limits: ScoreLimits): boolean => {
  const lowered = key.toLowerCase();
  return limits.keys.some((candidate) => lowered.includes(candidate));
};

export function isScoreValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Pure shape check. Rate is stateful and lives in ScoreGuard. */
export function validateScoreValue(value: unknown, limits: ScoreLimits = DEFAULT_SCORE_LIMITS): ScoreVerdict {
  if (!isScoreValue(value)) return { ok: false, value: 0, reason: 'non-finite' };
  if (value < 0) return { ok: false, value: 0, reason: 'negative' };
  if (value > limits.maxValue) {
    return { ok: false, value: limits.maxValue, reason: 'ceiling' };
  }
  return { ok: true, value };
}

export class ScoreGuard {
  private readonly last = new Map<string, { value: number; at: number }>();

  constructor(private readonly limits: ScoreLimits = DEFAULT_SCORE_LIMITS) {}

  /** Clamps a single reported score. Returns null when the key is not a score. */
  check(playerId: string, key: string, value: unknown, nowMs = Date.now()): ScoreVerdict | null {
    if (!isScoreKey(key, this.limits)) return null;
    const verdict = validateScoreValue(value, this.limits);
    const previous = this.last.get(playerId);
    let candidate = verdict.value;

    if (previous) {
      const elapsed = Math.max(0.001, (nowMs - previous.at) / 1000);
      const allowed = previous.value + this.limits.maxGainPerSecond * elapsed;
      if (candidate > allowed) {
        candidate = Math.floor(allowed);
        this.last.set(playerId, { value: candidate, at: nowMs });
        return { ok: false, value: candidate, reason: 'rate' };
      }
    }

    this.last.set(playerId, { value: candidate, at: nowMs });
    if (!verdict.ok) return { ...verdict, value: candidate };
    return candidate === verdict.value ? verdict : { ok: true, value: candidate };
  }

  release(playerId: string): void {
    this.last.delete(playerId);
  }
}
