// Camera framing helpers: fit the viewport to a set of scene objects.
//
// Pure THREE maths on a camera rig, so the scene engine stays a thin caller and
// the framing rules are testable without a renderer.

import * as THREE from 'three';
import type { StudioCameraRig } from './studioCameraRig';

/**
 * Frames the bounding box of `meshes` and returns true when something was
 * framed. Empty input leaves the camera untouched.
 */
export function frameObjects(rig: StudioCameraRig, meshes: Iterable<THREE.Object3D>): boolean {
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  if (box.isEmpty()) return false;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  rig.focus(center, Math.max(6, size.length() * 1.2));
  return true;
}
