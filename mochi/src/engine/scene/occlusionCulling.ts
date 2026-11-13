// Runtime occlusion culling for heavy world objects.
//
// Static boxes (blocks, terrain, model colliders) are rasterised into a coarse
// w-buffer; anything whose screen rectangle is fully covered by closer geometry is
// hidden. The buffer is only rebuilt when the camera has actually moved, so the cost
// is paid on movement rather than every frame.
//
// The pass is self-gating: below a handful of occluders or targets it does nothing,
// because the rasterisation would cost more than the draws it saves. Stats are
// exposed so a real scene can answer whether it pays, instead of assuming it.

import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import {
  OCCLUSION_HEIGHT,
  OCCLUSION_WIDTH,
  rasterizeOccluders,
  testOcclusion,
  type OcclusionView
} from './occlusionRaster';

/** Below this many occluder boxes the pass does not run. */
export const OCCLUSION_MIN_OCCLUDERS = 16;
/** Below this many targets the pass does not run. */
export const OCCLUSION_MIN_TARGETS = 8;
/** Camera translation that invalidates the buffer, in metres. */
export const OCCLUSION_MOVE_THRESHOLD = 1.5;
/** Camera rotation that invalidates the buffer, in radians (~3 degrees). */
export const OCCLUSION_ROTATE_THRESHOLD = 0.05;

export interface OcclusionStats {
  occluders: number;
  targets: number;
  occluded: number;
  rebuildMs: number;
  testMs: number;
}

const targets = new Map<THREE.Object3D, THREE.Box3>();
const depth = new Float32Array(OCCLUSION_WIDTH * OCCLUSION_HEIGHT);
const view: OcclusionView = {
  viewProjection: new Float32Array(16),
  width: OCCLUSION_WIDTH,
  height: OCCLUSION_HEIGHT
};

const lastPosition = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
const lastQuaternion = new THREE.Quaternion();
const scratchMatrix = new THREE.Matrix4();

let occluders: Float32Array = new Float32Array(0);
let bufferValid = false;
let stats: OcclusionStats | null = null;

function targetBox(object: THREE.Object3D): THREE.Box3 | null {
  let box = targets.get(object);
  if (!box) return null;
  if (box.isEmpty()) {
    box.setFromObject(object);
    if (box.isEmpty()) return null;
  }
  return box;
}

/** Writes each target's cached world box into a flat candidate array. */
function collectCandidates(list: THREE.Object3D[]): Float32Array {
  const boxes: number[] = [];
  for (const object of list) {
    const box = targetBox(object);
    if (!box) continue;
    boxes.push(
      box.min.x, box.min.y, box.min.z,
      box.max.x, box.max.y, box.max.z
    );
  }
  return new Float32Array(boxes);
}

/**
 * Registers a world object for occlusion testing. The box is computed once: pass a
 * box for objects that move, or call `refreshOcclusionTarget` when they do.
 */
export function registerOcclusionTarget(
  object: THREE.Object3D,
  box?: THREE.Box3
): () => void {
  targets.set(object, box ? box.clone() : new THREE.Box3().setFromObject(object));
  return () => {
    targets.delete(object);
  };
}

/** Recomputes a target's world box. Call after moving a registered object. */
export function refreshOcclusionTarget(object: THREE.Object3D): void {
  const box = targets.get(object);
  if (box) box.setFromObject(object);
}

export function clearOcclusionTargets(): void {
  targets.clear();
  occluders = new Float32Array(0);
  bufferValid = false;
  stats = null;
}

/** Replaces the occluder set. Expects 6 floats per box (min xyz, max xyz). */
export function setOccluderBoxes(boxes: Float32Array): void {
  occluders = boxes;
  bufferValid = false;
}

/** Collects solid static boxes from the physics world as occluders. */
export function setOccludersFromPhysics(world: PhysicsWorld): number {
  const collected: number[] = [];
  for (const body of world.getAllBodies()) {
    if (body.type !== 'static' || body.isTrigger || body.shape.type !== 'box') continue;
    const bounds = body.getAABB();
    if (!(bounds.max.x > bounds.min.x)) continue;
    collected.push(
      bounds.min.x, bounds.min.y, bounds.min.z,
      bounds.max.x, bounds.max.y, bounds.max.z
    );
  }
  occluders = new Float32Array(collected);
  bufferValid = false;
  return occluders.length / 6;
}

/** Restores every target to visible-because-not-occluded. */
function releaseOcclusionFlags(): void {
  for (const object of targets.keys()) {
    object.userData.occlusionCulled = false;
    object.visible = object.userData.distanceCulled !== true;
  }
}

export function getOcclusionStats(): OcclusionStats | null {
  return stats;
}

/**
 * Updates the occlusion state for every registered target. Returns null when the
 * pass did not run (too few occluders or targets), in which case any object this
 * pass had hidden is restored.
 */
export function updateOcclusionCulling(camera: THREE.Camera): OcclusionStats | null {
  const occluderCount = Math.floor(occluders.length / 6);
  if (occluderCount < OCCLUSION_MIN_OCCLUDERS || targets.size < OCCLUSION_MIN_TARGETS) {
    if (stats) releaseOcclusionFlags();
    stats = null;
    return null;
  }

  camera.updateMatrixWorld();
  const rebuild =
    !bufferValid ||
    camera.position.distanceToSquared(lastPosition) > OCCLUSION_MOVE_THRESHOLD ** 2 ||
    camera.quaternion.angleTo(lastQuaternion) > OCCLUSION_ROTATE_THRESHOLD;

  let rebuildMs = 0;
  if (rebuild) {
    scratchMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    view.viewProjection.set(scratchMatrix.elements);
    const started = performance.now();
    rasterizeOccluders(occluders, view, depth);
    rebuildMs = performance.now() - started;
    lastPosition.copy(camera.position);
    lastQuaternion.copy(camera.quaternion);
    bufferValid = true;
  }

  const list = [...targets.keys()];
  const candidates = collectCandidates(list);
  const tested = Math.floor(candidates.length / 6);
  const started = performance.now();
  const flags = tested > 0 ? testOcclusion(candidates, view, depth) : new Uint8Array(0);
  const testMs = performance.now() - started;

  let occluded = 0;
  let entry = 0;
  for (const object of list) {
    if (!targetBox(object)) continue;
    const culled = flags[entry] === 1;
    entry += 1;
    if (culled) occluded += 1;
    object.userData.occlusionCulled = culled;
    object.visible = !culled && object.userData.distanceCulled !== true;
  }

  stats = { occluders: occluderCount, targets: targets.size, occluded, rebuildMs, testMs };
  return stats;
}
