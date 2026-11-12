// CC0 PBR material catalog extracted from access/Texture (Poly Haven 1K-JPG
// packs, downscaled to 512px). Pure data: no THREE.js import so the catalog can
// be validated in tests.

export interface MaterialMapPaths {
  color: string;
  normal?: string;
  roughness?: string;
}

export interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  maps: MaterialMapPaths;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'brick_red',
    name: 'Red Brick',
    category: 'masonry',
    maps: {
      color: '/materials/brick_red/color.jpg',
      normal: '/materials/brick_red/normal.jpg',
      roughness: '/materials/brick_red/roughness.jpg'
    }
  },
  {
    id: 'concrete_plain',
    name: 'Plain Concrete',
    category: 'concrete',
    maps: {
      color: '/materials/concrete_plain/color.jpg',
      normal: '/materials/concrete_plain/normal.jpg',
      roughness: '/materials/concrete_plain/roughness.jpg'
    }
  },
  {
    id: 'wood_planks',
    name: 'Wood Planks',
    category: 'wood',
    maps: {
      color: '/materials/wood_planks/color.jpg',
      normal: '/materials/wood_planks/normal.jpg',
      roughness: '/materials/wood_planks/roughness.jpg'
    }
  },
  {
    id: 'metal_plate',
    name: 'Metal Plate',
    category: 'metal',
    maps: {
      color: '/materials/metal_plate/color.jpg',
      normal: '/materials/metal_plate/normal.jpg',
      roughness: '/materials/metal_plate/roughness.jpg'
    }
  },
  {
    id: 'diamond_plate',
    name: 'Diamond Plate',
    category: 'metal',
    maps: {
      color: '/materials/diamond_plate/color.jpg',
      normal: '/materials/diamond_plate/normal.jpg',
      roughness: '/materials/diamond_plate/roughness.jpg'
    }
  },
  {
    id: 'grass_field',
    name: 'Grass Field',
    category: 'nature',
    maps: {
      color: '/materials/grass_field/color.jpg',
      normal: '/materials/grass_field/normal.jpg',
      roughness: '/materials/grass_field/roughness.jpg'
    }
  },
  {
    id: 'stone_paving',
    name: 'Stone Paving',
    category: 'stone',
    maps: {
      color: '/materials/stone_paving/color.jpg',
      normal: '/materials/stone_paving/normal.jpg',
      roughness: '/materials/stone_paving/roughness.jpg'
    }
  },
  {
    id: 'marble_white',
    name: 'White Marble',
    category: 'stone',
    maps: {
      color: '/materials/marble_white/color.jpg',
      normal: '/materials/marble_white/normal.jpg',
      roughness: '/materials/marble_white/roughness.jpg'
    }
  },
  {
    id: 'lava_flow',
    name: 'Lava Flow',
    category: 'nature',
    maps: {
      color: '/materials/lava_flow/color.jpg',
      normal: '/materials/lava_flow/normal.jpg',
      roughness: '/materials/lava_flow/roughness.jpg'
    }
  },
  {
    id: 'fabric_weave',
    name: 'Woven Fabric',
    category: 'fabric',
    maps: {
      color: '/materials/fabric_weave/color.jpg',
      normal: '/materials/fabric_weave/normal.jpg',
      roughness: '/materials/fabric_weave/roughness.jpg'
    }
  }
];

export const MATERIAL_PRESET_IDS: string[] = MATERIAL_PRESETS.map((preset) => preset.id);

export function isValidMaterialId(id: string | null | undefined): boolean {
  if (!id) return false;
  return MATERIAL_PRESETS.some((preset) => preset.id === id);
}

export function getMaterialPreset(id: string | null | undefined): MaterialPreset | null {
  if (!id) return null;
  return MATERIAL_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function resolveMaterialUrl(path: string, assetBase = ''): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = assetBase.replace(/\/+$/, '');
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
