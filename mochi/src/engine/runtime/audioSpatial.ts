// Spatial audio maths: distance rolloff, stereo pan and Doppler.
//
// Pure functions, so the bus stays a thin WebAudio wrapper and the behaviour is
// testable without an AudioContext. The listener yaw convention is "0 faces +Z,
// +Y is up", matching the camera basis the runtime passes in.

export const MAX_AUDIBLE_DISTANCE = 34;

export interface SpatialListener {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. 0 faces +Z. */
  yaw: number;
}

export interface SpatialPoint {
  x: number;
  y: number;
  z: number;
}

export interface AttenuationOptions {
  /** Distance at which the sound still plays at full volume. Defaults to 2 m. */
  refDistance?: number;
  /** Beyond this the sound is inaudible. Defaults to 34 m. */
  maxDistance?: number;
  /** How fast volume falls off past `refDistance`. Defaults to 1. */
  rolloff?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function distance3d(a: SpatialPoint, b: SpatialPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Inverse-distance rolloff with a taper over the last tenth of the audible range,
 * so a sound fades out instead of clicking off at `maxDistance`.
 */
export function attenuationGain(distance: number, options: AttenuationOptions = {}): number {
  const refDistance = Math.max(options.refDistance ?? 2, 0.01);
  const maxDistance = Math.max(options.maxDistance ?? MAX_AUDIBLE_DISTANCE, refDistance + 0.01);
  const rolloff = Math.max(options.rolloff ?? 1, 0);

  if (!Number.isFinite(distance) || distance >= maxDistance) return 0;
  if (distance <= refDistance) return 1;

  const inverse = refDistance / (refDistance + rolloff * (distance - refDistance));
  const taperStart = maxDistance * 0.9;
  const taper =
    distance <= taperStart ? 1 : (maxDistance - distance) / (maxDistance - taperStart);

  return clamp(inverse * taper, 0, 1);
}

/**
 * Stereo position from -1 (hard left) to 1 (hard right). A source sitting on top
 * of the listener is centred, because direction is undefined at zero distance.
 */
export function panFor(
  listener: SpatialListener,
  source: SpatialPoint,
  minDistance = 1
): number {
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance < Math.max(minDistance, 1e-6)) return 0;

  const rightX = Math.cos(listener.yaw);
  const rightZ = -Math.sin(listener.yaw);
  return clamp((dx * rightX + dz * rightZ) / distance, -1, 1);
}

/**
 * Pitch multiplier for the Doppler effect. Above 1 means the source is closing on
 * the listener. Clamped, because a script can hand in any velocity at all.
 */
export function dopplerRatio(
  listener: SpatialPoint,
  source: SpatialPoint,
  sourceVelocity: SpatialPoint,
  listenerVelocity: SpatialPoint = { x: 0, y: 0, z: 0 },
  speedOfSound = 343
): number {
  const dx = listener.x - source.x;
  const dy = listener.y - source.y;
  const dz = listener.z - source.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6 || speedOfSound <= 0) return 1;

  const ux = dx / distance;
  const uy = dy / distance;
  const uz = dz / distance;

  const sourceClosing = sourceVelocity.x * ux + sourceVelocity.y * uy + sourceVelocity.z * uz;
  const listenerClosing = listenerVelocity.x * ux + listenerVelocity.y * uy + listenerVelocity.z * uz;

  const ratio = (speedOfSound + listenerClosing) / (speedOfSound - sourceClosing);
  return Number.isFinite(ratio) ? clamp(ratio, 0.5, 2) : 1;
}

/** Converts a pitch ratio to the cents value an oscillator's detune expects. */
export function ratioToCents(ratio: number): number {
  return 1200 * Math.log2(clamp(ratio, 0.5, 2));
}
