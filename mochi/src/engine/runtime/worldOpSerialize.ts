// Peers only need the transform and identity of a runtime-spawned node, never its
// script: re-sending the body would make every client re-run it.

import type { StudioObject } from '../studio/types';

export function serializeNode(def: StudioObject): StudioObject {
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    position: { ...def.position },
    rotation: { ...def.rotation },
    scale: { ...def.scale },
    color: def.color,
    material: def.material,
    anchored: def.anchored,
    canCollide: def.canCollide,
    parentId: def.parentId ?? null
  };
}
