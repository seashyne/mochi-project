// Distance-based visibility culling for heavy world objects such as imported
// models. Three.js already frustum-culls meshes; this skips whole subtrees that
// are too far away to matter on large maps.

import * as THREE from 'three';

export const DEFAULT_MODEL_CULL_DISTANCE = 300;

const targets = new Set<THREE.Object3D>();
const worldPosition = new THREE.Vector3();

export function registerCullTarget(
  object: THREE.Object3D,
  maxDistance = DEFAULT_MODEL_CULL_DISTANCE
): () => void {
  object.userData.cullDistance = maxDistance;
  targets.add(object);
  return () => {
    targets.delete(object);
  };
}

export function updateDistanceCulling(camera: THREE.Camera): number {
  let hidden = 0;
  for (const object of targets) {
    if (!object.parent) {
      targets.delete(object);
      continue;
    }
    object.getWorldPosition(worldPosition);
    const maxDistance =
      typeof object.userData.cullDistance === 'number'
        ? object.userData.cullDistance
        : DEFAULT_MODEL_CULL_DISTANCE;
    const visible = worldPosition.distanceToSquared(camera.position) <= maxDistance * maxDistance;
    // Two independent passes can veto a draw: distance and occlusion. Each stores
    // its own verdict and recomputes visibility from both, so neither can undo the
    // other by simply writing `visible`.
    object.userData.distanceCulled = !visible;
    object.visible = visible && object.userData.occlusionCulled !== true;
    if (!object.visible) hidden++;
  }
  return hidden;
}

export function clearCullTargets(): void {
  targets.clear();
}

export function getCullTargetCount(): number {
  return targets.size;
}
