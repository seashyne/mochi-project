// KHR_materials_variants support for our GLTFLoader pipeline.
//
// Three.js does not implement this extension (its loader points at an external
// community plugin). Creator assets use it to ship one model with several
// material skins, so a player can switch colourways without a second download.
//
// The parsing helpers are adapted from PlayCanvas (MIT) and live in
// engine/vendor/playcanvas/glb/variants.ts. This file is the three.js side:
// it binds variant materials onto meshes and swaps them at runtime.

import * as THREE from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createVariantIndex,
  readPrimitiveVariants,
  variantNamesByIndex
} from '../vendor/playcanvas/glb/variants';

export const VARIANTS_EXTENSION = 'KHR_materials_variants';

// Key used on Object3D.userData to hold the binding. Exported so editor panels
// and the runtime read the same shape.
export const VARIANTS_USER_DATA_KEY = 'mochiMaterialVariants';

export interface MaterialVariantBinding {
  defaultMaterial: THREE.Material | THREE.Material[];
  variants: Record<string, THREE.Material | THREE.Material[]>;
}

interface AssociationWithPrimitive {
  meshes?: number;
  primitives?: number;
}

function readBinding(object: THREE.Object3D): MaterialVariantBinding | null {
  const value = object.userData?.[VARIANTS_USER_DATA_KEY];
  return value && typeof value === 'object' ? (value as MaterialVariantBinding) : null;
}

// GLTFLoader plugin. Registered once per parser; after the scene graph exists it
// resolves every mapped material and attaches it to the matching mesh.
export class GLTFMaterialsVariantsExtension implements GLTFLoaderPlugin {
  readonly name = VARIANTS_EXTENSION;

  constructor(private readonly parser: GLTFParser) {}

  async afterRoot(result: GLTF): Promise<void> {
    const variantIndex = createVariantIndex(this.parser.json);
    if (!variantIndex) return;

    const names = variantNamesByIndex(variantIndex);
    const associations = this.parser.associations as Map<THREE.Object3D | THREE.Material | THREE.Texture, AssociationWithPrimitive>;

    for (const [object, reference] of associations) {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) continue;
      if (typeof reference?.meshes !== 'number' || typeof reference?.primitives !== 'number') continue;

      const primitive = this.parser.json?.meshes?.[reference.meshes]?.primitives?.[reference.primitives];
      const mapping = readPrimitiveVariants(primitive);
      if (!mapping) continue;

      const variants: Record<string, THREE.Material> = {};
      for (const [variantKey, materialIndex] of Object.entries(mapping)) {
        const name = names[Number(variantKey)];
        if (!name) continue;
        const material = await this.parser.getDependency('material', materialIndex);
        if (material) variants[name] = material as THREE.Material;
      }

      if (Object.keys(variants).length === 0) continue;
      mesh.userData[VARIANTS_USER_DATA_KEY] = {
        defaultMaterial: mesh.material,
        variants
      } satisfies MaterialVariantBinding;
    }

    // Nothing to assign onto the result itself; the bindings live on the meshes
    // so that cloned instances keep working.
    void result;
  }
}

// Registers the extension on a loader. Call inside the GLTFLoader setup chain.
export function registerMaterialVariants(loader: {
  register: (callback: (parser: GLTFParser) => GLTFLoaderPlugin) => unknown;
}): void {
  loader.register((parser) => new GLTFMaterialsVariantsExtension(parser));
}

// Variant names available anywhere under root, in declaration order.
export function listMaterialVariants(root: THREE.Object3D): string[] {
  const seen = new Set<string>();
  root.traverse((child) => {
    const binding = readBinding(child);
    if (!binding) return;
    for (const name of Object.keys(binding.variants)) seen.add(name);
  });
  return [...seen];
}

// Applies a variant to every bound mesh under root. Passing null restores the
// material the file shipped with. Returns the number of meshes changed.
export function applyMaterialVariant(root: THREE.Object3D, name: string | null): number {
  let changed = 0;
  root.traverse((child) => {
    const binding = readBinding(child);
    if (!binding) return;
    const mesh = child as THREE.Mesh;
    const next = name === null ? binding.defaultMaterial : binding.variants[name];
    if (!next || mesh.material === next) return;
    mesh.material = next;
    changed += 1;
  });
  return changed;
}

// Reads the variant currently applied to a mesh, or null when it is on the
// file's default material. Used by the Studio inspector.
export function readActiveVariant(object: THREE.Object3D): string | null {
  const binding = readBinding(object);
  const mesh = object as THREE.Mesh;
  if (!binding || !mesh.material) return null;
  for (const [name, material] of Object.entries(binding.variants)) {
    if (material === mesh.material) return name;
  }
  return null;
}
