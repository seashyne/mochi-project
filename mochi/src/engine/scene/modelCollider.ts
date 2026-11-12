// Physics colliders for imported models. The clean-room physics engine only
// supports primitives, so models get either one fitted box or, for large
// imported assets, a small compound of per-mesh boxes.

import * as THREE from 'three';
import {
  getModelColliderData,
  mountModel,
  ModelBounds,
  ModelColliderData,
  ModelColliderPart
} from '../assets/modelLoader';
import { PhysicsWorld, RigidBody } from '../physics';
import { StudioObject } from '../studio/types';

export const MIN_MODEL_HALF_EXTENT = 0.05;
export const COLLIDER_DETAIL_MIN_SPAN = 4;

function scaledHalfExtents(
  part: ModelColliderPart,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  return {
    x: Math.max(MIN_MODEL_HALF_EXTENT, part.halfExtents.x * scaleX),
    y: Math.max(MIN_MODEL_HALF_EXTENT, part.halfExtents.y * scaleY),
    z: Math.max(MIN_MODEL_HALF_EXTENT, part.halfExtents.z * scaleZ)
  };
}

function rotationEuler(obj: StudioObject): THREE.Euler {
  return new THREE.Euler(obj.rotation.x, obj.rotation.y, obj.rotation.z);
}

export function buildModelBody(
  obj: StudioObject,
  bounds: ModelBounds,
  idPrefix = 'physics'
): RigidBody {
  const scaleX = Math.abs(obj.scale.x);
  const scaleY = Math.abs(obj.scale.y);
  const scaleZ = Math.abs(obj.scale.z);
  const halfExtents = scaledHalfExtents(
    {
      center: { x: 0, y: 0, z: 0 },
      halfExtents: { x: bounds.x / 2, y: bounds.y / 2, z: bounds.z / 2 }
    },
    scaleX,
    scaleY,
    scaleZ
  );

  // Normalized models stand on the object origin, so the box center sits at
  // half its scaled height, rotated along with the visual container.
  const offset = new THREE.Vector3(0, halfExtents.y, 0).applyEuler(rotationEuler(obj));

  return new RigidBody({
    id: `${idPrefix}_${obj.id}`,
    type: 'static',
    position: {
      x: obj.position.x + offset.x,
      y: obj.position.y + offset.y,
      z: obj.position.z + offset.z
    },
    rotation: obj.rotation,
    shape: { type: 'box', halfExtents },
    userData: { objectId: obj.id, kind: 'model' }
  });
}

function buildPartBody(
  obj: StudioObject,
  part: ModelColliderPart,
  index: number,
  idPrefix: string
): RigidBody {
  const scaleX = Math.abs(obj.scale.x);
  const scaleY = Math.abs(obj.scale.y);
  const scaleZ = Math.abs(obj.scale.z);
  const halfExtents = scaledHalfExtents(part, scaleX, scaleY, scaleZ);
  const offset = new THREE.Vector3(
    part.center.x * scaleX,
    part.center.y * scaleY,
    part.center.z * scaleZ
  ).applyEuler(rotationEuler(obj));

  return new RigidBody({
    id: `${idPrefix}_${obj.id}_${index}`,
    type: 'static',
    position: {
      x: obj.position.x + offset.x,
      y: obj.position.y + offset.y,
      z: obj.position.z + offset.z
    },
    rotation: obj.rotation,
    shape: { type: 'box', halfExtents },
    userData: { objectId: obj.id, kind: 'model', partIndex: index }
  });
}

// Large models with distinct sub-meshes use a compound of their biggest parts;
// small or single-mesh models keep the cheaper single-box fit.
export function buildModelBodies(
  obj: StudioObject,
  data: ModelColliderData,
  idPrefix = 'physics'
): RigidBody[] {
  const span = Math.max(
    Math.abs(data.bounds.x * obj.scale.x),
    Math.abs(data.bounds.y * obj.scale.y),
    Math.abs(data.bounds.z * obj.scale.z)
  );
  if (data.parts.length <= 1 || span < COLLIDER_DETAIL_MIN_SPAN) {
    return [buildModelBody(obj, data.bounds, idPrefix)];
  }
  return data.parts.map((part, index) => buildPartBody(obj, part, index, idPrefix));
}

// Mounts the visual model and, when CanCollide is on, adds its bodies once the
// GLB bounds are known. Returns a cancel handle for container disposal.
export function attachModelObject(
  container: THREE.Object3D,
  obj: StudioObject,
  physicsWorld: PhysicsWorld,
  bodies: RigidBody[],
  isDisposed: () => boolean,
  pending: Promise<void>[] = []
): () => void {
  if (!obj.assetUrl) return () => {};

  const cancelMount = mountModel(container, obj.assetUrl, { lod: true });
  if (obj.canCollide === false) return cancelMount;

  const ready = getModelColliderData(obj.assetUrl).then((data) => {
    if (isDisposed()) return;
    for (const body of buildModelBodies(obj, data)) {
      physicsWorld.addBody(body);
      bodies.push(body);
    }
  });
  pending.push(ready);
  void ready.catch((error) => console.warn(`Model collider failed for ${obj.assetUrl}`, error));
  return cancelMount;
}
