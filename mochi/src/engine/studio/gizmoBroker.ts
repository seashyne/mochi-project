// Owns the gizmo drag lifecycle: snapshots every selected transform at drag
// start, then fans the primary object's delta out to the whole selection.

import type { StudioObject } from './types';
import type { GizmoMode, GizmoTransformEvent } from './transformGizmo';
import { computeMultiTransform, TransformSnapshot, TransformUpdate } from './multiTransform';

export interface GizmoBrokerHost {
  getSelectedIds: () => string[];
  getObject: (id: string) => StudioObject | undefined;
  getMode: () => GizmoMode;
  apply: (id: string, transform: GizmoTransformEvent) => void;
}

type SingleCallback = (id: string, transform: GizmoTransformEvent) => void;
type ManyCallback = (updates: TransformUpdate[]) => void;

export class GizmoTransformBroker {
  private dragBase: TransformSnapshot | null = null;
  private onSingle: SingleCallback | null = null;
  private onMany: ManyCallback | null = null;

  constructor(private readonly host: GizmoBrokerHost) {}

  setCallbacks(onSingle: SingleCallback, onMany: ManyCallback): void {
    this.onSingle = onSingle;
    this.onMany = onMany;
  }

  setDragging(active: boolean): void {
    this.dragBase = active ? this.capture() : null;
  }

  change(transform: GizmoTransformEvent): void {
    const ids = this.host.getSelectedIds();
    const primaryId = ids[0];
    if (!primaryId) return;
    if (ids.length > 1 && this.dragBase) {
      const updates = computeMultiTransform(this.dragBase, primaryId, transform, this.host.getMode());
      updates.forEach((update) => this.host.apply(update.id, update.transform));
      this.onMany?.(updates);
    } else {
      this.host.apply(primaryId, transform);
      this.onSingle?.(primaryId, transform);
    }
  }

  private capture(): TransformSnapshot {
    const snapshot: TransformSnapshot = new Map();
    for (const id of this.host.getSelectedIds()) {
      const obj = this.host.getObject(id);
      if (!obj) continue;
      const { position, rotation, scale } = obj;
      snapshot.set(id, { position: { ...position }, rotation: { ...rotation }, scale: { ...scale } });
    }
    return snapshot;
  }
}
