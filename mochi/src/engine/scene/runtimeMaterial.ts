// Materials for game geometry.
//
// The Studio editor has honoured `material`, `materialTexture` and an uploaded
// `textureUrl` since the material library shipped, but the runtime never read any of
// them: `instancedBatch` and `objectMeshes` hard-coded roughness and metalness per
// object type, so a world looked different in the editor and in the game.
//
// This module is the runtime's half of that contract. It deliberately mirrors
// `studio/studioMeshBuilder.createStudioMaterial` rather than importing it: the studio
// builder takes a colour and returns a standalone material, while a batch needs the
// colour left to instance colors. The two must agree on the numbers.

import * as THREE from 'three';
import type { StudioMaterial } from '../studio/types';
import {
  getMaterialTextureSet,
  getTextureSetFromUrl,
  type MaterialTextureSet
} from '../materials/materialTextures';

export interface MaterialChoice {
  material?: StudioMaterial;
  materialTexture?: string | null;
  textureUrl?: string | null;
}

type TextureResolver = (choice: MaterialChoice) => MaterialTextureSet | null;

function resolveTextures(choice: MaterialChoice): MaterialTextureSet | null {
  return choice.textureUrl
    ? getTextureSetFromUrl(choice.textureUrl)
    : getMaterialTextureSet(choice.materialTexture);
}

// Test seam: texture loading needs a DOM, and the branch that applies the maps is
// worth covering. Pass null to restore the real resolver.
let textureResolver: TextureResolver = resolveTextures;

export function setRuntimeTextureResolver(next: TextureResolver | null): void {
  textureResolver = next ?? resolveTextures;
}

/** What the object asks for beyond a flat colour. */
export function surfaceKey(choice: MaterialChoice & { color?: string }): string {
  if (choice.textureUrl) return `tex:${choice.textureUrl}`;
  if (choice.materialTexture) return `preset:${choice.materialTexture}`;
  const material = choice.material ?? 'plastic';
  // Neon bakes the colour into its emissive, which an instanced mesh cannot vary per
  // instance, so the colour has to be part of the batch key.
  if (material === 'neon') return `neon:${choice.color ?? ''}`;
  return material;
}

/**
 * Builds the material for one object or one batch.
 *
 * `fallback` is the per-type default the runtime used before surfaces existed, so an
 * object that asks for nothing keeps exactly the look it had. `instanced` leaves the
 * colour white for instance colors to supply, except where the material bakes it.
 */
export function createRuntimeMaterial(
  choice: MaterialChoice,
  fallback: THREE.MeshStandardMaterialParameters,
  instanced: boolean,
  color?: THREE.Color
): THREE.Material {
  const textures = textureResolver(choice);

  if (textures?.map) {
    return new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap ?? undefined,
      roughnessMap: textures.roughnessMap ?? undefined,
      // The albedo comes from the map; instance colors still tint it.
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05
    });
  }

  const base: THREE.MeshStandardMaterialParameters = instanced
    ? { ...fallback, color: 0xffffff }
    : { ...fallback };

  switch (choice.material) {
    case 'neon':
      return new THREE.MeshStandardMaterial({
        ...base,
        roughness: 0.2,
        metalness: 0.1,
        emissive: instanced ? (color ?? new THREE.Color('#ffffff')) : (color ?? base.color),
        emissiveIntensity: 0.85
      });
    case 'metal':
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.2, metalness: 0.95 });
    case 'glass':
      return new THREE.MeshStandardMaterial({
        ...base,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.5
      });
    case 'wood':
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.85, metalness: 0 });
    default:
      return new THREE.MeshStandardMaterial(base);
  }
}
