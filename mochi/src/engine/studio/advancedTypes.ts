// Advanced authoring contracts: voxel terrain, physics constraints, particle emitters.
// Kept separate from types.ts so each module stays within the SRP line ceiling.

export type TerrainMaterialId =
  | 'grass'
  | 'rock'
  | 'sand'
  | 'snow'
  | 'mud'
  | 'lava'
  | 'water';

export const TERRAIN_MATERIALS: TerrainMaterialId[] = [
  'grass', 'rock', 'sand', 'snow', 'mud', 'lava', 'water'
];

export const TERRAIN_MATERIAL_COLORS: Record<TerrainMaterialId, string> = {
  grass: '#4f9a4a',
  rock: '#7b7f88',
  sand: '#d9bd7a',
  snow: '#e8f1f7',
  mud: '#6b5137',
  lava: '#e2542a',
  water: '#2f7fc1'
};

export const TERRAIN_MAX_WIDTH = 64;
export const TERRAIN_MAX_DEPTH = 64;
export const TERRAIN_MAX_HEIGHT = 32;

/** heights/materials are RLE strings: "value*count" pairs joined by commas. */
export interface TerrainData {
  width: number;
  depth: number;
  cellSize: number;
  voxelHeight: number;
  heights: string;
  materials: string;
}

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'erase';

export const TERRAIN_TOOLS: TerrainTool[] = [
  'raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'
];

export interface TerrainBrush {
  tool: TerrainTool;
  radius: number;
  strength: number;
  material: TerrainMaterialId;
  flattenHeight: number;
}

export const DEFAULT_TERRAIN_BRUSH: TerrainBrush = {
  tool: 'raise',
  radius: 3,
  strength: 1,
  material: 'grass',
  flattenHeight: 2
};

export type ConstraintKind = 'weld' | 'hinge' | 'spring' | 'rope' | 'rod';

export const CONSTRAINT_KINDS: ConstraintKind[] = [
  'weld', 'hinge', 'spring', 'rope', 'rod'
];

export interface ConstraintDef {
  kind: ConstraintKind;
  attachment0: string;
  attachment1: string;
  stiffness: number;
  damping: number;
  restLength: number;
  axis: { x: number; y: number; z: number };
}

export const DEFAULT_CONSTRAINT: ConstraintDef = {
  kind: 'weld',
  attachment0: '',
  attachment1: '',
  stiffness: 0.6,
  damping: 0.15,
  restLength: 4,
  axis: { x: 0, y: 1, z: 0 }
};

export type ParticleShape = 'spark' | 'smoke' | 'droplet';

export interface ParticleDef {
  rate: number;
  lifetime: number;
  speed: number;
  spread: number;
  size: number;
  color: string;
  gravity: number;
  shape: ParticleShape;
  enabled: boolean;
}

export const DEFAULT_PARTICLE: ParticleDef = {
  rate: 24,
  lifetime: 1.6,
  speed: 3,
  spread: 0.6,
  size: 0.18,
  color: '#ffb347',
  gravity: -2.5,
  shape: 'spark',
  enabled: true
};

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeConstraint(raw: unknown): ConstraintDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const kind = CONSTRAINT_KINDS.includes(rec.kind as ConstraintKind)
    ? (rec.kind as ConstraintKind)
    : 'weld';
  const axis = (rec.axis ?? {}) as Record<string, unknown>;
  return {
    kind,
    attachment0: typeof rec.attachment0 === 'string' ? rec.attachment0.slice(0, 128) : '',
    attachment1: typeof rec.attachment1 === 'string' ? rec.attachment1.slice(0, 128) : '',
    stiffness: clampNumber(rec.stiffness, 0, 1, DEFAULT_CONSTRAINT.stiffness),
    damping: clampNumber(rec.damping, 0, 1, DEFAULT_CONSTRAINT.damping),
    restLength: clampNumber(rec.restLength, 0, 512, DEFAULT_CONSTRAINT.restLength),
    axis: {
      x: clampNumber(axis.x, -1, 1, 0),
      y: clampNumber(axis.y, -1, 1, 1),
      z: clampNumber(axis.z, -1, 1, 0)
    }
  };
}

export function normalizeParticle(raw: unknown): ParticleDef {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PARTICLE };
  const rec = raw as Record<string, unknown>;
  const shape = rec.shape === 'smoke' || rec.shape === 'droplet' ? rec.shape : 'spark';
  return {
    rate: clampNumber(rec.rate, 0, 400, DEFAULT_PARTICLE.rate),
    lifetime: clampNumber(rec.lifetime, 0.1, 20, DEFAULT_PARTICLE.lifetime),
    speed: clampNumber(rec.speed, 0, 100, DEFAULT_PARTICLE.speed),
    spread: clampNumber(rec.spread, 0, 4, DEFAULT_PARTICLE.spread),
    size: clampNumber(rec.size, 0.01, 4, DEFAULT_PARTICLE.size),
    color: typeof rec.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(rec.color)
      ? rec.color
      : DEFAULT_PARTICLE.color,
    gravity: clampNumber(rec.gravity, -100, 100, DEFAULT_PARTICLE.gravity),
    shape,
    enabled: rec.enabled !== false
  };
}
