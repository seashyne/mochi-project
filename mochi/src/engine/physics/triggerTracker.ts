// Enter/stay/exit bookkeeping for trigger overlaps. Extracted from PhysicsWorld
// so the world class stays within the SRP line ceiling.

import { PhysicsVec3, TriggerEvent } from './types';

export class TriggerTracker {
  private active = new Set<string>();

  clear(): void {
    this.active.clear();
  }

  commit(
    overlaps: Set<string>,
    emit: (event: TriggerEvent) => void,
    visitorPosition: (id: string) => PhysicsVec3 | undefined
  ): void {
    for (const key of overlaps) {
      emit(this.makeEvent(key, this.active.has(key) ? 'stay' : 'enter', visitorPosition));
    }
    for (const key of this.active) {
      if (!overlaps.has(key)) emit(this.makeEvent(key, 'exit', visitorPosition));
    }
    this.active = overlaps;
  }

  private makeEvent(
    key: string,
    type: TriggerEvent['type'],
    visitorPosition: (id: string) => PhysicsVec3 | undefined
  ): TriggerEvent {
    const [triggerId, visitorId] = key.split('__');
    return {
      triggerBodyId: triggerId,
      visitorBodyId: visitorId,
      visitorPosition: visitorPosition(visitorId) ?? { x: 0, y: 0, z: 0 },
      type
    };
  }
}
