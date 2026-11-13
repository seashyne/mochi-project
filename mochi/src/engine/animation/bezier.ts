// CSS-style cubic-bezier easing.
//
// Mochi clips carry `easing: 'bezier'` plus four control points on the keyframe,
// matching the CSS `cubic-bezier(x1, y1, x2, y2)` form so a creator can reuse a
// curve they already know. The solver mirrors what browsers do: Newton-Raphson
// first, bisection as the safety net when the slope degenerates.

export type BezierPoints = [number, number, number, number];

// The CSS `ease` curve: a sane default when a creator flips a keyframe to bezier
// without picking points yet.
export const DEFAULT_EASE: BezierPoints = [0.25, 0.1, 0.25, 1];

function sampleCurve(control1: number, control2: number, t: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * control1 + 3 * inverse * t * t * control2 + t * t * t;
}

function sampleSlope(control1: number, control2: number, t: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * control1 + 6 * inverse * t * (control2 - control1) + 3 * t * t * (1 - control2);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

// Returns true when the four numbers form a usable curve: x values must stay in
// 0..1 or the curve is not a function of time.
export function isValidEase(points: unknown): points is BezierPoints {
  if (!Array.isArray(points) || points.length !== 4) return false;
  if (!points.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
  const [x1, , x2] = points as BezierPoints;
  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
}

// Maps linear progress (0..1) through the curve.
export function cubicBezierEase(points: BezierPoints, progress: number): number {
  const [x1, y1, x2, y2] = points;
  const target = clamp01(progress);
  if (target === 0 || target === 1) return target;

  // A curve with both x controls at the ends is the identity; skip the solve.
  if (x1 === y1 && x2 === y2) return target;

  let t = target;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const x = sampleCurve(x1, x2, t) - target;
    if (Math.abs(x) < 1e-6) return sampleCurve(y1, y2, t);
    const slope = sampleSlope(x1, x2, t);
    if (Math.abs(slope) < 1e-6) break;
    t = clamp01(t - x / slope);
  }

  let low = 0;
  let high = 1;
  t = target;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const x = sampleCurve(x1, x2, t);
    if (Math.abs(x - target) < 1e-6) break;
    if (x < target) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return sampleCurve(y1, y2, t);
}
