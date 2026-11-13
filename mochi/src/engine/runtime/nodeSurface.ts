// Swapping a live node's surface at runtime.
//
// Split out of LiveNode because the swap needs the per-type shading defaults that the
// mesh builder owns, and importing those into the node class pushed it past the file
// ceiling.
//
// Only standard-material children are replaced: a compound object such as the jump pad
// keeps its glow ring, which is a basic material on purpose.

import * as THREE from 'three';
import type { StudioObject } from '../studio/types';
import { resolveMaterialAlias } from '../scene/materialAliases';
import { materialFor } from '../scene/objectMeshes';

/**
 * Sets the surface by name. A name that imported scripts use resolves through the
 * alias table; an unknown name is ignored rather than raising, because a ported script
 * should not die on a material it cannot find.
 */
export function setNodeMaterial(def: StudioObject, mesh: THREE.Object3D, name: string): void {
  const alias = resolveMaterialAlias(name);
  if (!alias) return;
  def.material = alias.material;
  def.materialTexture = alias.preset;
  refreshMaterial(def, mesh);
}

export function setNodeMaterialTexture(
  def: StudioObject,
  mesh: THREE.Object3D,
  preset: string | null
): void {
  def.materialTexture = preset;
  refreshMaterial(def, mesh);
}

function refreshMaterial(def: StudioObject, mesh: THREE.Object3D): void {
  mesh.traverse((child) => {
    const target = child as THREE.Mesh;
    if (!target.isMesh) return;
    const previous = target.material as THREE.Material | THREE.Material[] | undefined;
    if (!previous || Array.isArray(previous)) return;
    if (!(previous as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    target.material = materialFor(def);
    previous.dispose();
  });
}
