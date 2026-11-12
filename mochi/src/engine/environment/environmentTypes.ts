// Environment state contract shared by the Studio editor, the player runtime,
// and the draft manifest. Pure data only: no THREE.js imports so the schema can
// be validated in tests and on the server.

export type SkyboxPresetId =
  | 'day_clear'
  | 'day_soft'
  | 'day_bright'
  | 'day_haze'
  | 'sunset'
  | 'night_stars'
  | 'night_moon';

export interface SkyboxPreset {
  id: SkyboxPresetId;
  label: string;
  environment: string;
  preview: string | null;
  exposure: number;
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  fogColor: string;
  fogDensity: number;
}

export interface EnvironmentState {
  skyboxId: SkyboxPresetId;
  exposure: number;
  sunAzimuth: number;
  sunElevation: number;
  ambientIntensity: number;
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;
}

export const DEFAULT_SKYBOX_ID: SkyboxPresetId = 'day_clear';

// Genre-standard starter scene: bright neutral day, soft ambient fill, no fog.
export const STARTER_ENVIRONMENT: EnvironmentState = {
  skyboxId: DEFAULT_SKYBOX_ID,
  exposure: 1,
  sunAzimuth: 135,
  sunElevation: 55,
  ambientIntensity: 0.65,
  fogEnabled: false,
  fogColor: '#a8c0d8',
  fogDensity: 0.0025
};

const MIN_EXPOSURE = 0.1;
const MAX_EXPOSURE = 4;
const MIN_SUN_ELEVATION = -10;
const MAX_SUN_ELEVATION = 90;
const MAX_FOG_DENSITY = 0.2;

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

// Coerces untrusted manifest input into a valid EnvironmentState. Unknown
// skyboxes fall back to the starter preset so a corrupt draft still loads.
export function normalizeEnvironmentState(
  input: unknown,
  isValidSkybox: (id: string) => boolean
): EnvironmentState {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const skyboxId =
    typeof raw.skyboxId === 'string' && isValidSkybox(raw.skyboxId)
      ? (raw.skyboxId as SkyboxPresetId)
      : STARTER_ENVIRONMENT.skyboxId;

  return {
    skyboxId,
    exposure: clampNumber(raw.exposure, MIN_EXPOSURE, MAX_EXPOSURE, STARTER_ENVIRONMENT.exposure),
    sunAzimuth: clampNumber(raw.sunAzimuth, 0, 360, STARTER_ENVIRONMENT.sunAzimuth),
    sunElevation: clampNumber(
      raw.sunElevation,
      MIN_SUN_ELEVATION,
      MAX_SUN_ELEVATION,
      STARTER_ENVIRONMENT.sunElevation
    ),
    ambientIntensity: clampNumber(raw.ambientIntensity, 0, 3, STARTER_ENVIRONMENT.ambientIntensity),
    fogEnabled: raw.fogEnabled === true,
    fogColor: normalizeHexColor(raw.fogColor, STARTER_ENVIRONMENT.fogColor),
    fogDensity: clampNumber(raw.fogDensity, 0, MAX_FOG_DENSITY, STARTER_ENVIRONMENT.fogDensity)
  };
}
