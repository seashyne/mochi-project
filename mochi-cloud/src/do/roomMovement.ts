// Server-side movement validation for the game room.
//
// The client reports where it thinks it is. The room decides whether that is
// possible: a player who edits their own position is corrected, not believed. This
// is the first half of server authority - the client is still the one simulating,
// but it cannot claim a position the rules do not allow.

export interface MovementLimits {
  /** Horizontal metres per second a player may cover. */
  maxSpeed: number;
  /** Vertical change allowed in one report, generous enough for a fall. */
  maxVerticalStep: number;
  /** Distance that counts as a teleport rather than movement. */
  maxTeleport: number;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
}

export const DEFAULT_MOVEMENT_LIMITS: MovementLimits = {
  maxSpeed: 18,
  maxVerticalStep: 40,
  maxTeleport: 25
};

/** The client broadcasts at 20 Hz; anything faster is treated as a 20 Hz step. */
const MIN_ELAPSED_MS = 50;

export type MovementRejection = 'non-finite' | 'speed' | 'teleport' | 'bounds';

export interface MovementResult {
  accepted: boolean;
  /** The position the room will keep: the reported one, or a clamped correction. */
  x: number;
  y: number;
  z: number;
  reason?: MovementRejection;
}

interface Point {
  x?: number;
  y?: number;
  z?: number;
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Decides what to keep from a reported position. A rejected report still returns a
 * position - the clamped one - so the client can be snapped to something sane
 * instead of being left where it cheated to.
 */
export function validateMovement(
  previous: Point,
  reported: Point,
  elapsedMs: number,
  limits: MovementLimits = DEFAULT_MOVEMENT_LIMITS
): MovementResult {
  const px = finite(previous.x) ?? 0;
  const py = finite(previous.y) ?? 0;
  const pz = finite(previous.z) ?? 0;

  const nx = finite(reported.x);
  const ny = finite(reported.y);
  const nz = finite(reported.z);
  if (nx === null || ny === null || nz === null) {
    return { accepted: false, x: px, y: py, z: pz, reason: 'non-finite' };
  }

  const dt = Math.max(finite(elapsedMs) ?? MIN_ELAPSED_MS, MIN_ELAPSED_MS) / 1000;
  const dx = nx - px;
  const dz = nz - pz;
  const horizontal = Math.hypot(dx, dz);
  const vertical = Math.abs(ny - py);
  const total = Math.hypot(horizontal, vertical);

  if (total > limits.maxTeleport) {
    return { accepted: false, x: px, y: py, z: pz, reason: 'teleport' };
  }
  if (vertical > limits.maxVerticalStep) {
    return { accepted: false, x: px, y: py, z: pz, reason: 'teleport' };
  }

  const allowed = limits.maxSpeed * dt;
  if (horizontal > allowed) {
    // Keep the direction, shorten the step: a lagging client is corrected rather
    // than reset, which is the difference between a rubber band and a teleport.
    const scale = allowed / horizontal;
    return {
      accepted: false,
      x: px + dx * scale,
      y: ny,
      z: pz + dz * scale,
      reason: 'speed'
    };
  }

  const bounds = limits.bounds;
  if (
    bounds &&
    (nx < bounds.minX || nx > bounds.maxX ||
      ny < bounds.minY || ny > bounds.maxY ||
      nz < bounds.minZ || nz > bounds.maxZ)
  ) {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    return {
      accepted: false,
      x: clamp(nx, bounds.minX, bounds.maxX),
      y: clamp(ny, bounds.minY, bounds.maxY),
      z: clamp(nz, bounds.minZ, bounds.maxZ),
      reason: 'bounds'
    };
  }

  return { accepted: true, x: nx, y: ny, z: nz };
}
