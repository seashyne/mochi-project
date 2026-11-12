// Collider factory for streamed world objects. Body ids carry a type prefix so the
// runtime can map a physics trigger back to the object that owns it.

import { RigidBody } from '../physics';
import { StudioObject } from '../studio/types';

const BODY_ID_PREFIX = /^(physics_|trigger_|coin_)/;

export function physicsBodyId(obj: StudioObject): string {
  return `physics_${obj.id}`;
}

export function triggerBodyId(obj: StudioObject): string {
  return `trigger_${obj.id}`;
}

export function coinBodyId(obj: StudioObject): string {
  return `coin_${obj.id}`;
}

/** Strips the prefix added by the loader to recover the owning object id. */
export function objectIdFromBodyId(bodyId: string): string {
  return bodyId.replace(BODY_ID_PREFIX, '');
}

function halfExtents(obj: StudioObject) {
  return {
    x: Math.max(0.1, Math.abs(obj.scale.x) / 2),
    y: Math.max(0.1, Math.abs(obj.scale.y) / 2),
    z: Math.max(0.1, Math.abs(obj.scale.z) / 2)
  };
}

function boxBody(obj: StudioObject, id: string, isTrigger: boolean): RigidBody {
  return new RigidBody({
    id,
    type: 'static',
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: obj.rotation,
    shape: { type: 'box', halfExtents: halfExtents(obj) },
    isTrigger
  });
}

/** Returns the collider a world object contributes, or null when it has none. */
export function createObjectBody(obj: StudioObject): RigidBody | null {
  switch (obj.type) {
    case 'spawn':
    case 'block':
    case 'platform':
      return boxBody(obj, physicsBodyId(obj), false);
    case 'jump_pad':
    case 'hazard':
      return boxBody(obj, triggerBodyId(obj), true);
    case 'coin':
      return new RigidBody({
        id: coinBodyId(obj),
        type: 'static',
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        shape: { type: 'sphere', radius: Math.max(0.2, Math.abs(obj.scale.x) / 2) },
        isTrigger: true
      });
    default:
      return null;
  }
}
