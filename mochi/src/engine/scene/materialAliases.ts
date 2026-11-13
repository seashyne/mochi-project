// Material names used by imported scripts.
//
// Worlds are often ported from another platform, where a part's look is chosen by
// name - "Grass", "Brick", "Wood" - and the name is the whole surface: there is no
// separate texture slot. Our model splits the two, `material` for the shading response
// and `materialTexture` for a bundled PBR set, so a ported script would otherwise set
// a name that renders as plain plastic.
//
// This table is the bridge. It maps a name onto the pair our renderer understands,
// using only the texture sets we already ship, so nothing new is downloaded and no
// third-party asset is involved.
//
// Names are matched case-insensitively with punctuation removed, so "DiamondPlate",
// "diamond plate" and "diamond_plate" all resolve.

import type { StudioMaterial } from '../studio/types';

export interface MaterialAlias {
  material: StudioMaterial;
  /** Bundled PBR preset id, or null for a flat colour. */
  preset: string | null;
}

const ALIASES: Record<string, MaterialAlias> = {
  plastic: { material: 'plastic', preset: null },
  smoothplastic: { material: 'plastic', preset: null },
  neon: { material: 'neon', preset: null },
  glass: { material: 'glass', preset: null },
  ice: { material: 'glass', preset: null },

  metal: { material: 'metal', preset: 'metal_plate' },
  corrodedmetal: { material: 'metal', preset: 'metal_plate' },
  foil: { material: 'metal', preset: 'metal_plate' },
  diamondplate: { material: 'metal', preset: 'diamond_plate' },

  concrete: { material: 'plastic', preset: 'concrete_plain' },
  brick: { material: 'plastic', preset: 'brick_red' },
  wood: { material: 'wood', preset: 'wood_planks' },
  woodplanks: { material: 'wood', preset: 'wood_planks' },

  marble: { material: 'plastic', preset: 'marble_white' },
  granite: { material: 'plastic', preset: 'stone_paving' },
  slate: { material: 'plastic', preset: 'stone_paving' },
  cobblestone: { material: 'plastic', preset: 'stone_paving' },
  sandstone: { material: 'plastic', preset: 'stone_paving' },

  fabric: { material: 'plastic', preset: 'fabric_weave' },
  grass: { material: 'plastic', preset: 'grass_field' },
  leafygrass: { material: 'plastic', preset: 'grass_field' }
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Resolves a script-supplied name, or null when nothing matches. */
export function resolveMaterialAlias(name: string): MaterialAlias | null {
  return ALIASES[normalize(name)] ?? null;
}

/**
 * The name to report back for a part's current surface, so a script that sets
 * `Material = "Grass"` and reads it back gets "Grass" rather than "plastic".
 */
export function aliasForSurface(material?: StudioMaterial, preset?: string | null): string {
  if (preset) {
    for (const [name, alias] of Object.entries(ALIASES)) {
      if (alias.preset === preset) {
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  }
  const base = material ?? 'plastic';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Names a script may set, for documentation and validation messages. */
export const MATERIAL_ALIAS_NAMES: string[] = Object.keys(ALIASES);
