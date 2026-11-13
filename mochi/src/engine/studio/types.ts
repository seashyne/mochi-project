// Studio 3D World Builder type definitions and object schemas
// Defines placed 3D primitives, gizmo transform coordinates, and script associations

import type { ConstraintDef, ParticleDef, TerrainData } from './advancedTypes';

export type StudioObjectType =
  | 'block'
  | 'sphere'
  | 'cylinder'
  | 'ramp'
  | 'platform'
  | 'coin'
  | 'jump_pad'
  | 'hazard'
  | 'spawn'
  | 'model'
  | 'terrain'
  | 'constraint'
  | 'particle';

export type StudioMaterial = 'plastic' | 'neon' | 'metal' | 'glass' | 'wood';

export interface StudioVec3 {
  x: number;
  y: number;
  z: number;
}

export interface StudioObject {
  id: string;
  name: string;
  type: StudioObjectType;
  position: StudioVec3;
  rotation: StudioVec3; // Radians in data model, degrees in inspector UI
  scale: StudioVec3;
  color: string;
  material?: StudioMaterial;
  materialTexture?: string | null; // PBR preset id from the bundled CC0 library
  textureAccessId?: string | null; // access id of a creator-uploaded texture (must exist)
  textureUrl?: string | null; // resolved URL for the uploaded texture
  anchored?: boolean; // Default true: frozen in space against gravity
  canCollide?: boolean; // Default true: solid barrier vs pass-through trigger
  parentId?: string | null;
  luaScript?: string;
  assetUrl?: string; // Content-addressed GLB/GLTF URL for model objects
  assetKey?: string;
  assetHash?: string; // SHA-256 digest, also used for deduplication
  assetSizeBytes?: number;
  assetContentType?: string;
  terrain?: TerrainData; // Voxel heightfield, RLE encoded (see terrainCodec.ts)
  constraint?: ConstraintDef; // Joint linking two other object ids
  particle?: ParticleDef; // Emitter settings
}

export interface StudioSceneSnapshot {
  version: string;
  title: string;
  objects: StudioObject[];
  createdAt: string;
  animations?: import('../animation/clip').MochiAnimationClip[];
  // Optional parameter-driven state graph. When present the runtime plays clips
  // through transitions instead of starting them all at once.
  animationStateMachine?: import('../animation/stateMachine').AnimStateMachineDef;
}

export const OBJECT_TYPE_DEFAULTS: Record<
  StudioObjectType,
  { label: string; defaultColor: string; defaultScale: StudioVec3; defaultScript?: string }
> = {
  block: {
    label: 'Cube Block',
    defaultColor: '#6366f1',
    defaultScale: { x: 2, y: 2, z: 2 },
    defaultScript: '-- Solid static geometry block\nprint("Block placed")'
  },
  sphere: {
    label: 'Sphere',
    defaultColor: '#f472b6',
    defaultScale: { x: 2, y: 2, z: 2 },
    defaultScript: '-- Round solid part; collider follows the widest axis\nlocal part = script.parent\nprint(part.name .. " is live")'
  },
  cylinder: {
    label: 'Cylinder',
    defaultColor: '#a78bfa',
    defaultScale: { x: 2, y: 3, z: 2 },
    defaultScript: '-- Upright pillar; perfect for towers and columns\nlocal part = script.parent\nprint(part.name .. " is live")'
  },
  ramp: {
    label: 'Ramp Wedge',
    defaultColor: '#f97316',
    defaultScale: { x: 4, y: 2, z: 4 },
    defaultScript: '-- Sloped walkway: rises along local +X. Rotate around Y to change direction.\nlocal ramp = script.parent\nprint(ramp.name .. " slope active")'
  },
  platform: {
    label: 'Moving Platform',
    defaultColor: '#38bdf8',
    defaultScale: { x: 4, y: 0.5, z: 4 },
    defaultScript: 'local platform = script.parent\nscript.onUpdate.Connect(function(dt)\n  platform.position.x = math.sin(os.clock() * 2) * 5\nend)'
  },
  coin: {
    label: 'Collectible Coin',
    defaultColor: '#fbbf24',
    defaultScale: { x: 1, y: 0.2, z: 1 },
    defaultScript: 'local coin = script.parent\ncoin.onTouch(function(player)\n  player.addScore("Coins", 10)\n  world.playSound("coin_pickup")\n  coin.setVisible(false)\nend)'
  },
  jump_pad: {
    label: 'Impulse Jump Pad',
    defaultColor: '#10b981',
    defaultScale: { x: 3, y: 0.3, z: 3 },
    defaultScript: 'local pad = script.parent\npad.onTouch(function(player)\n  player.setVelocity(0, 18, 0)\n  world.playSound("jump_boost")\nend)'
  },
  hazard: {
    label: 'Lava Hazard',
    defaultColor: '#ef4444',
    defaultScale: { x: 4, y: 0.4, z: 4 },
    defaultScript: 'local hazard = script.parent\nhazard.onTouch(function(player)\n  player.respawn()\n  ui.showNotification("Respawned at SpawnPoint", 2)\nend)'
  },
  spawn: {
    label: 'Spawn Point',
    defaultColor: '#00a2ff',
    defaultScale: { x: 2.5, y: 0.2, z: 2.5 },
    defaultScript: '-- Player spawn origin\nworld.setSpawnPoint(script.parent.position)'
  },
  model: {
    label: 'Model Group',
    defaultColor: '#94a3b8',
    defaultScale: { x: 1, y: 1, z: 1 },
    defaultScript: '-- Model group container'
  },
  terrain: {
    label: 'Terrain',
    defaultColor: '#4f9a4a',
    defaultScale: { x: 1, y: 1, z: 1 },
    defaultScript: '-- Voxel terrain; sculpt with the Terrain tools'
  },
  constraint: {
    label: 'Constraint',
    defaultColor: '#c084fc',
    defaultScale: { x: 1, y: 1, z: 1 },
    defaultScript: '-- Joint between two parts'
  },
  particle: {
    label: 'Particle Emitter',
    defaultColor: '#ffb347',
    defaultScale: { x: 1, y: 1, z: 1 },
    defaultScript: '-- Point emitter; configure rate and lifetime'
  }
};
