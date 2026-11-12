// CC0 starter skybox catalog sourced from access/Sky (Poly Haven packages).
// Each preset points at an HDR EXR for scene lighting plus an optional JPG
// thumbnail for the Studio picker.

import { DEFAULT_SKYBOX_ID, type SkyboxPreset, type SkyboxPresetId } from './environmentTypes';

export const SKYBOX_PRESETS: SkyboxPreset[] = [
  {
    id: 'day_clear',
    label: 'Clear Day',
    environment: '/skyboxes/day_clear/env.exr',
    preview: '/skyboxes/day_clear/preview.jpg',
    exposure: 1,
    sunIntensity: 2.2,
    sunColor: '#fff6e5',
    ambientIntensity: 0.65,
    fogColor: '#a8c0d8',
    fogDensity: 0.0025
  },
  {
    id: 'day_soft',
    label: 'Soft Day',
    environment: '/skyboxes/day_soft/env.exr',
    preview: '/skyboxes/day_soft/preview.jpg',
    exposure: 1.05,
    sunIntensity: 1.8,
    sunColor: '#fdf4e8',
    ambientIntensity: 0.75,
    fogColor: '#b6c7d6',
    fogDensity: 0.003
  },
  {
    id: 'day_bright',
    label: 'Bright Day',
    environment: '/skyboxes/day_bright/env.exr',
    preview: '/skyboxes/day_bright/preview.jpg',
    exposure: 0.95,
    sunIntensity: 2.6,
    sunColor: '#ffffff',
    ambientIntensity: 0.55,
    fogColor: '#c3d4e2',
    fogDensity: 0.0018
  },
  {
    id: 'day_haze',
    label: 'Hazy Day',
    environment: '/skyboxes/day_haze/env.exr',
    preview: '/skyboxes/day_haze/preview.jpg',
    exposure: 1.1,
    sunIntensity: 1.6,
    sunColor: '#ffeccd',
    ambientIntensity: 0.85,
    fogColor: '#cbd6dc',
    fogDensity: 0.006
  },
  {
    id: 'sunset',
    label: 'Sunset',
    environment: '/skyboxes/sunset/env.exr',
    preview: '/skyboxes/sunset/preview.jpg',
    exposure: 1.15,
    sunIntensity: 1.4,
    sunColor: '#ffb37a',
    ambientIntensity: 0.6,
    fogColor: '#e0a882',
    fogDensity: 0.0045
  },
  {
    id: 'night_stars',
    label: 'Night Stars',
    environment: '/skyboxes/night_stars/env.exr',
    preview: '/skyboxes/night_stars/preview.jpg',
    exposure: 1.3,
    sunIntensity: 0.35,
    sunColor: '#8ea6d8',
    ambientIntensity: 0.35,
    fogColor: '#0d1524',
    fogDensity: 0.005
  },
  {
    id: 'night_moon',
    label: 'Night Moon',
    environment: '/skyboxes/night_moon/env.exr',
    preview: '/skyboxes/night_moon/preview.jpg',
    exposure: 1.25,
    sunIntensity: 0.5,
    sunColor: '#b9c9ef',
    ambientIntensity: 0.4,
    fogColor: '#111a2b',
    fogDensity: 0.004
  }
];

export const SKYBOX_PRESET_IDS: SkyboxPresetId[] = SKYBOX_PRESETS.map((p) => p.id);

export function isValidSkyboxId(id: string): boolean {
  return SKYBOX_PRESETS.some((preset) => preset.id === id);
}

export function getSkyboxPreset(id: string | null | undefined): SkyboxPreset {
  const found = SKYBOX_PRESETS.find((preset) => preset.id === id);
  if (found) return found;
  return SKYBOX_PRESETS.find((preset) => preset.id === DEFAULT_SKYBOX_ID) ?? SKYBOX_PRESETS[0];
}

// Resolves a preset-relative path against the configured asset origin so the
// same catalog works on localhost and on a CDN domain.
export function resolveSkyboxUrl(path: string, assetBase = ''): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = assetBase.replace(/\/+$/, '');
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
