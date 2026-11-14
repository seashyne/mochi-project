// Material names from imported scripts.
//
// Worlds are often ported from another platform, where a part's look is chosen by a
// name and that name is the whole surface: there is no separate texture slot. Our model
// splits the two - `material` for the shading response, `materialTexture` for a bundled
// PBR set - so a ported script would otherwise set a name that renders as plain plastic.
//
// This table is the bridge. Every name a ported script might use resolves here, mapped
// onto the closest surface we actually ship. Names we have no texture for fall back to
// a plain shading mode rather than failing, because a script that dies on an unsupported
// material is worse than one that renders it plainly.
//
// `name` is the canonical spelling. A script compares `part.Material` against
// `Enum.Material.Grass`, which is the string "Grass", so the spelling has to survive the
// round trip exactly - "SmoothPlastic" must not come back as "Smoothplastic".

import type { StudioMaterial } from '../studio/types';

export interface MaterialAlias {
  /** Canonical spelling, the value a script compares against. */
  name: string;
  material: StudioMaterial;
  /** Bundled PBR preset id, or null for a flat colour. */
  preset: string | null;
}

// Keyed by the normalised name: lower case, punctuation removed.
const ALIASES: Record<string, MaterialAlias> = {
  plastic: { name: 'Plastic', material: 'plastic', preset: null },
  smoothplastic: { name: 'SmoothPlastic', material: 'plastic', preset: null },
  rubber: { name: 'Rubber', material: 'plastic', preset: null },
  air: { name: 'Air', material: 'plastic', preset: null },

  neon: { name: 'Neon', material: 'neon', preset: null },
  forcefield: { name: 'ForceField', material: 'neon', preset: null },
  glass: { name: 'Glass', material: 'glass', preset: null },
  ice: { name: 'Ice', material: 'glass', preset: null },
  glacier: { name: 'Glacier', material: 'glass', preset: null },

  wood: { name: 'Wood', material: 'wood', preset: 'wood_planks' },
  woodplanks: { name: 'WoodPlanks', material: 'wood', preset: 'wood_planks' },
  cardboard: { name: 'Cardboard', material: 'wood', preset: 'wood_planks' },

  metal: { name: 'Metal', material: 'metal', preset: 'metal_plate' },
  corrodedmetal: { name: 'CorrodedMetal', material: 'metal', preset: 'metal_plate' },
  foil: { name: 'Foil', material: 'metal', preset: 'metal_plate' },
  diamondplate: { name: 'DiamondPlate', material: 'metal', preset: 'diamond_plate' },

  concrete: { name: 'Concrete', material: 'plastic', preset: 'concrete_plain' },
  plaster: { name: 'Plaster', material: 'plastic', preset: 'concrete_plain' },
  asphalt: { name: 'Asphalt', material: 'plastic', preset: 'concrete_plain' },

  brick: { name: 'Brick', material: 'plastic', preset: 'brick_red' },
  marble: { name: 'Marble', material: 'plastic', preset: 'marble_white' },
  snow: { name: 'Snow', material: 'plastic', preset: 'marble_white' },
  salt: { name: 'Salt', material: 'plastic', preset: 'marble_white' },

  granite: { name: 'Granite', material: 'plastic', preset: 'stone_paving' },
  slate: { name: 'Slate', material: 'plastic', preset: 'stone_paving' },
  cobblestone: { name: 'Cobblestone', material: 'plastic', preset: 'stone_paving' },
  pebble: { name: 'Pebble', material: 'plastic', preset: 'stone_paving' },
  rock: { name: 'Rock', material: 'plastic', preset: 'stone_paving' },
  basalt: { name: 'Basalt', material: 'plastic', preset: 'stone_paving' },
  limestone: { name: 'Limestone', material: 'plastic', preset: 'stone_paving' },
  pavement: { name: 'Pavement', material: 'plastic', preset: 'stone_paving' },
  sandstone: { name: 'Sandstone', material: 'plastic', preset: 'stone_paving' },
  sand: { name: 'Sand', material: 'plastic', preset: 'stone_paving' },
  mud: { name: 'Mud', material: 'plastic', preset: 'stone_paving' },
  ground: { name: 'Ground', material: 'plastic', preset: 'stone_paving' },
  ceramictiles: { name: 'CeramicTiles', material: 'plastic', preset: 'stone_paving' },
  clayrooftiles: { name: 'ClayRoofTiles', material: 'plastic', preset: 'stone_paving' },
  roofshingles: { name: 'RoofShingles', material: 'plastic', preset: 'stone_paving' },

  grass: { name: 'Grass', material: 'plastic', preset: 'grass_field' },
  leafygrass: { name: 'LeafyGrass', material: 'plastic', preset: 'grass_field' },
  fabric: { name: 'Fabric', material: 'plastic', preset: 'fabric_weave' },
  carpet: { name: 'Carpet', material: 'plastic', preset: 'fabric_weave' },

  crackedlava: { name: 'CrackedLava', material: 'plastic', preset: 'lava_flow' }
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Resolves a script-supplied name, or null when nothing matches. */
export function resolveMaterialAlias(name: string): MaterialAlias | null {
  return ALIASES[normalize(name)] ?? null;
}

/**
 * The canonical name for a part's current surface. A script that sets
 * `Material = Enum.Material.Grass` reads "Grass" back, so an equality test against the
 * enum works; a surface authored in the Studio reads as the name it maps to.
 */
export function aliasForSurface(material?: StudioMaterial, preset?: string | null): string {
  if (preset) {
    for (const alias of Object.values(ALIASES)) {
      if (alias.preset === preset) return alias.name;
    }
  }
  const base = material ?? 'plastic';
  for (const alias of Object.values(ALIASES)) {
    if (alias.name.toLowerCase() === base) return alias.name;
  }
  return base;
}

/** Canonical names, in the order a picker should show them. */
export const MATERIAL_ALIAS_NAMES: string[] = Object.values(ALIASES).map((alias) => alias.name);

/**
 * Reads a name out of whatever a script assigned: a string, or a table carrying a
 * `Name` field (the shape an enum item has). Returns null for anything else.
 */
export function materialNameOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const name = (value as { Name?: unknown }).Name;
    if (typeof name === 'string') return name;
  }
  return null;
}
