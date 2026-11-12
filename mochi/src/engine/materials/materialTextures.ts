// Lazily loads and caches PBR texture sets for Studio material presets. Textures
// are shared across every mesh using the same preset so a scene with hundreds of
// textured blocks still holds one GPU upload per map.

import * as THREE from 'three';
import { getMaterialPreset, resolveMaterialUrl } from './materialPresets';

export interface MaterialTextureSet {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
}

const cache = new Map<string, MaterialTextureSet>();
const loader = new THREE.TextureLoader();

function loadTexture(path: string, assetBase: string, isColor: boolean): THREE.Texture | null {
  try {
    const texture = loader.load(resolveMaterialUrl(path, assetBase));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

export function getMaterialTextureSet(
  presetId: string | null | undefined,
  assetBase = ''
): MaterialTextureSet | null {
  const preset = getMaterialPreset(presetId);
  if (!preset) return null;

  const key = `${assetBase}::${preset.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const set: MaterialTextureSet = {
    map: loadTexture(preset.maps.color, assetBase, true),
    normalMap: preset.maps.normal ? loadTexture(preset.maps.normal, assetBase, false) : null,
    roughnessMap: preset.maps.roughness
      ? loadTexture(preset.maps.roughness, assetBase, false)
      : null
  };
  cache.set(key, set);
  return set;
}

// Creator-uploaded textures resolve through their access id server-side, so the
// runtime only ever receives a concrete URL to load.
export function getTextureSetFromUrl(
  url: string | null | undefined,
  assetBase = ''
): MaterialTextureSet | null {
  if (!url) return null;
  const key = `upload::${assetBase}::${url}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const map = loadTexture(url, assetBase, true);
  if (!map) return null;
  const set: MaterialTextureSet = { map, normalMap: null, roughnessMap: null };
  cache.set(key, set);
  return set;
}

export function clearMaterialTextureCache(): void {  for (const set of cache.values()) {
    set.map?.dispose();
    set.normalMap?.dispose();
    set.roughnessMap?.dispose();
  }
  cache.clear();
}
