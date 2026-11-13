// Small shape checks shared by the animation validators. Dependency-free so the
// edge bundle stays free of engine imports.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown, maxLength = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function validateVec3(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['x', 'y', 'z'].every((axis) => isFiniteNumber(value[axis]));
}
// CSS cubic-bezier control points: four finite numbers, x controls in 0..1.
export function isValidEasePoints(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return false;
  const [x1, , x2] = value as number[];
  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
}
