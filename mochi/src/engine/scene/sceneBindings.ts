// Joins a loaded world's meshes and colliders into per-object bindings, so the runtime
// can adopt objects that are already in the scene instead of spawning duplicates.

import * as THREE from 'three';
import { RigidBody } from '../physics';
import { StudioObject } from '../studio/types';
import { objectIdFromBodyId } from './sceneBodies';

export interface SceneBinding {
  mesh: THREE.Object3D | null;
  body: RigidBody | null;
}

export function collectBindings(
  objects: StudioObject[],
  meshes: THREE.Object3D[],
  bodies: RigidBody[]
): Map<string, SceneBinding> {
  const meshById = new Map<string, THREE.Object3D>();
  for (const mesh of meshes) {
    const id = (mesh.userData as { id?: string } | undefined)?.id;
    if (id) meshById.set(id, mesh);
  }

  const bodyById = new Map<string, RigidBody>();
  for (const body of bodies) {
    bodyById.set(objectIdFromBodyId(body.id), body);
  }

  const bindings = new Map<string, SceneBinding>();
  for (const obj of objects) {
    bindings.set(obj.id, {
      mesh: meshById.get(obj.id) ?? null,
      body: bodyById.get(obj.id) ?? null
    });
  }
  return bindings;
}

/** Merges chunk bindings; later maps win on id collisions. */
export function mergeBindings(...maps: Array<Map<string, SceneBinding>>): Map<string, SceneBinding> {
  const merged = new Map<string, SceneBinding>();
  for (const map of maps) {
    for (const [id, binding] of map) merged.set(id, binding);
  }
  return merged;
}
