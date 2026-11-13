// Validation and flood control for peer world edits.
//
// A client can ask the room to spawn or destroy an object. Both the shape and the
// rate of that request have to be checked at the edge: an unbounded spawn loop is
// a denial-of-service against every other player in the session.

export interface WorldOpBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface WorldOpLimits {
  bounds: WorldOpBounds;
  /** Serialised bytes of the payload. */
  maxOpBytes: number;
}

export const DEFAULT_WORLD_OP_LIMITS: WorldOpLimits = {
  bounds: { minX: -10_000, maxX: 10_000, minY: -1_000, maxY: 10_000, minZ: -10_000, maxZ: 10_000 },
  maxOpBytes: 8 * 1024
};

export type WorldOpVerdict =
  | { ok: true; kind: 'spawn' | 'destroy' }
  | { ok: false; reason: 'kind' | 'bytes' | 'id' | 'type' | 'position' | 'scale' | 'rotation' | 'bounds' };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validVector(value: unknown, bounds?: WorldOpBounds): 'position' | 'scale' | 'rotation' | 'bounds' | null {
  if (!value || typeof value !== 'object') return 'position';
  const vec = value as Record<string, unknown>;
  if (!finite(vec.x) || !finite(vec.y) || !finite(vec.z)) return 'position';
  if (bounds && (vec.x < bounds.minX || vec.x > bounds.maxX ||
    vec.y < bounds.minY || vec.y > bounds.maxY ||
    vec.z < bounds.minZ || vec.z > bounds.maxZ)) return 'bounds';
  return null;
}

/** Returns the kind of a safe op, or the reason it must be dropped. */
export function validateWorldOp(
  op: unknown,
  limits: WorldOpLimits = DEFAULT_WORLD_OP_LIMITS
): WorldOpVerdict {
  if (!op || typeof op !== 'object') return { ok: false, reason: 'kind' };
  const record = op as Record<string, unknown>;
  if (record.kind !== 'spawn' && record.kind !== 'destroy') return { ok: false, reason: 'kind' };

  let bytes: number;
  try {
    bytes = JSON.stringify(record).length;
  } catch {
    return { ok: false, reason: 'bytes' };
  }
  if (bytes > limits.maxOpBytes) return { ok: false, reason: 'bytes' };

  if (record.kind === 'destroy') {
    if (typeof record.id !== 'string' || record.id.length === 0 || record.id.length > 128) {
      return { ok: false, reason: 'id' };
    }
    return { ok: true, kind: 'destroy' };
  }

  const object = record.object;
  if (!object || typeof object !== 'object') return { ok: false, reason: 'type' };
  const def = object as Record<string, unknown>;
  if (typeof def.id !== 'string' || def.id.length === 0 || def.id.length > 128) {
    return { ok: false, reason: 'id' };
  }
  if (typeof def.type !== 'string' || def.type.length === 0 || def.type.length > 64) {
    return { ok: false, reason: 'type' };
  }
  if (def.position !== undefined) {
    const problem = validVector(def.position, limits.bounds);
    if (problem) return { ok: false, reason: problem };
  }
  if (def.scale !== undefined) {
    const problem = validVector(def.scale);
    if (problem === 'position') return { ok: false, reason: 'scale' };
    const vec = def.scale as Record<string, number>;
    if (vec.x <= 0 || vec.y <= 0 || vec.z <= 0) return { ok: false, reason: 'scale' };
  }
  if (def.rotation !== undefined) {
    const problem = validVector(def.rotation);
    if (problem === 'position') return { ok: false, reason: 'rotation' };
  }

  return { ok: true, kind: 'spawn' };
}

/** Per-player spawn budget, separate from the room's generic rate limiter. */
export class SpawnBudget {
  private readonly tokens = new Map<string, { count: number; lastRefill: number }>();

  constructor(
    private readonly ratePerSecond = 10,
    private readonly burst = 20
  ) {}

  allow(playerId: string, nowMs = Date.now()): boolean {
    const elapsed = Math.max(0, nowMs - (this.tokens.get(playerId)?.lastRefill ?? nowMs)) / 1000;
    const previous = this.tokens.get(playerId) ?? { count: this.burst, lastRefill: nowMs };
    const count = Math.min(this.burst, previous.count + elapsed * this.ratePerSecond);
    if (count < 1) {
      this.tokens.set(playerId, { count, lastRefill: nowMs });
      return false;
    }
    this.tokens.set(playerId, { count: count - 1, lastRefill: nowMs });
    return true;
  }

  release(playerId: string): void {
    this.tokens.delete(playerId);
  }
}
