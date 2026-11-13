// Adapted from PlayCanvas Engine 2.25.0 (MIT).
// Original: src/framework/parsers/glb/extensions/khr-materials-variants.js
// Copyright (c) 2011-2026 PlayCanvas Ltd.
// The MIT text ships in mochi/public/THIRD_PARTY_NOTICES.txt.
//
// Changes from upstream: TypeScript types instead of plain JS, no PlayCanvas
// engine imports, and the primitive mapping is returned instead of being
// written into a shared table keyed by mesh id.
//
// Spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_variants

export type VariantIndex = Record<string, number>;

// variant index -> material index, for a single primitive
export type VariantMaterialMap = Record<number, number>;

interface ExtensionCarrier {
  extensions?: Record<string, unknown>;
}

interface VariantsExtension {
  variants?: Array<{ name?: string }>;
}

interface PrimitiveVariantsExtension {
  mappings?: Array<{ material?: number; variants?: number[] }>;
}

function readVariantsExtension(source: ExtensionCarrier | null | undefined): VariantsExtension | null {
  const value = source?.extensions?.['KHR_materials_variants'];
  return value && typeof value === 'object' ? (value as VariantsExtension) : null;
}

// Returns a map of variant name to declaration index, or null when the file
// declares no variants at all.
export function createVariantIndex(gltf: unknown): VariantIndex | null {
  const extension = readVariantsExtension(gltf as ExtensionCarrier | null);
  const list = extension?.variants;
  if (!Array.isArray(list) || list.length === 0) return null;

  const index: VariantIndex = {};
  for (let i = 0; i < list.length; i += 1) {
    const name = list[i]?.name;
    if (typeof name === 'string' && name.length > 0) index[name] = i;
  }
  return Object.keys(index).length > 0 ? index : null;
}

// Flattens a primitive's mappings into variant index -> material index. A single
// mapping may cover several variants, which is how the spec models shared
// materials across skins.
export function readPrimitiveVariants(primitive: unknown): VariantMaterialMap | null {
  const extension = readVariantsExtension(primitive as ExtensionCarrier | null) as PrimitiveVariantsExtension | null;
  const mappings = extension?.mappings;
  if (!Array.isArray(mappings)) return null;

  const map: VariantMaterialMap = {};
  let count = 0;
  for (const mapping of mappings) {
    if (!mapping || typeof mapping.material !== 'number' || !Array.isArray(mapping.variants)) continue;
    for (const variant of mapping.variants) {
      if (typeof variant !== 'number') continue;
      map[variant] = mapping.material;
      count += 1;
    }
  }
  return count > 0 ? map : null;
}

// Variant names ordered by declaration index, so a numeric index can be turned
// back into the name a creator sees in the Studio.
export function variantNamesByIndex(index: VariantIndex): string[] {
  const names: string[] = [];
  for (const [name, position] of Object.entries(index)) names[position] = name;
  return names;
}
