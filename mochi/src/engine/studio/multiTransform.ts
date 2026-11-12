// Pure delta maths for dragging a gizmo with several objects selected. The
// primary object's transform is authoritative; the rest follow the same delta.

import type { GizmoMode, GizmoTransformEvent } from './transformGizmo';
import type { StudioVec3 } from './types';

export interface TransformUpdate {
  id: string;
  transform: GizmoTransformEvent;
}

export type TransformSnapshot = Map<string, GizmoTransformEvent>;

function add(a: StudioVec3, b: StudioVec3, sign = 1): StudioVec3 {
  return { x: a.x + sign * b.x, y: a.y + sign * b.y, z: a.z + sign * b.z };
}

function subtract(a: StudioVec3, b: StudioVec3): StudioVec3 {
  return add(a, b, -1);
}

function scaleRatio(next: StudioVec3, base: StudioVec3, current: StudioVec3): StudioVec3 {
  const ratio = (n: number, b: number) => (Math.abs(b) < 1e-6 ? 1 : n / b);
  return {
    x: Math.max(0.01, current.x * ratio(next.x, base.x)),
    y: Math.max(0.01, current.y * ratio(next.y, base.y)),
    z: Math.max(0.01, current.z * ratio(next.z, base.z))
  };
}

/**
 * `snapshots` holds every selected object's transform at drag start, so the
 * result never accumulates frame-to-frame drift. Only the active gizmo axis
 * group is applied; other channels stay untouched.
 */
export function computeMultiTransform(
  snapshots: TransformSnapshot,
  primaryId: string,
  next: GizmoTransformEvent,
  mode: GizmoMode
): TransformUpdate[] {
  const primaryBase = snapshots.get(primaryId);
  if (!primaryBase) return [{ id: primaryId, transform: next }];

  const dPos = subtract(next.position, primaryBase.position);
  const dRot = subtract(next.rotation, primaryBase.rotation);
  const updates: TransformUpdate[] = [{ id: primaryId, transform: next }];

  for (const [id, base] of snapshots) {
    if (id === primaryId) continue;
    const transform: GizmoTransformEvent = {
      position: { ...base.position },
      rotation: { ...base.rotation },
      scale: { ...base.scale }
    };
    if (mode === 'translate') transform.position = add(base.position, dPos);
    else if (mode === 'rotate') transform.rotation = add(base.rotation, dRot);
    else transform.scale = scaleRatio(next.scale, primaryBase.scale, base.scale);
    updates.push({ id, transform });
  }
  return updates;
}
