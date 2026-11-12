// Default service catalog for every Mochi Studio project. A new experience opens
// with the same container tree a scene-graph editor expects, so the Explorer and
// the Properties dock always have a meaningful selection: Workspace holds the
// parts, Lighting holds the sun and clock, Sky holds the skybox, and Atmosphere
// holds the fog volume. Pure data so the shell can be tested without THREE.

export type StudioServiceId =
  | 'workspace'
  | 'players'
  | 'lighting'
  | 'sky'
  | 'atmosphere'
  | 'materialservice'
  | 'replicatedfirst'
  | 'replicatedstorage'
  | 'serverscriptservice'
  | 'serverstorage'
  | 'startergui'
  | 'starterpack'
  | 'starterplayer'
  | 'soundservice'
  | 'testservice';

export type ServiceIconKey =
  | 'workspace'
  | 'players'
  | 'lighting'
  | 'sky'
  | 'atmosphere'
  | 'material'
  | 'folder'
  | 'database'
  | 'server'
  | 'gui'
  | 'backpack'
  | 'player'
  | 'sound'
  | 'test';

export interface StudioServiceNode {
  id: StudioServiceId;
  name: string;
  className: string;
  icon: ServiceIconKey;
  parentId: StudioServiceId | null;
  /** One-line description shown in the Properties dock header. */
  summary: string;
}

export const STUDIO_SERVICES: StudioServiceNode[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    className: 'Workspace',
    icon: 'workspace',
    parentId: null,
    summary: 'Holds every part, terrain volume and constraint in the scene.'
  },
  {
    id: 'players',
    name: 'Players',
    className: 'Players',
    icon: 'players',
    parentId: null,
    summary: 'Players currently connected to a running session.'
  },
  {
    id: 'lighting',
    name: 'Lighting',
    className: 'Lighting',
    icon: 'lighting',
    parentId: null,
    summary: 'Sun direction, time of day, ambient fill and exposure.'
  },
  {
    id: 'sky',
    name: 'Sky',
    className: 'Sky',
    icon: 'sky',
    parentId: 'lighting',
    summary: 'Skybox asset used for the background and image-based lighting.'
  },
  {
    id: 'atmosphere',
    name: 'Atmosphere',
    className: 'Atmosphere',
    icon: 'atmosphere',
    parentId: 'lighting',
    summary: 'Fog density and colour blended into the distance.'
  },
  {
    id: 'materialservice',
    name: 'MaterialService',
    className: 'MaterialService',
    icon: 'material',
    parentId: null,
    summary: 'Shared PBR material presets and uploaded textures.'
  },
  {
    id: 'replicatedfirst',
    name: 'ReplicatedFirst',
    className: 'ReplicatedFirst',
    icon: 'folder',
    parentId: null,
    summary: 'Content streamed to clients before the scene loads.'
  },
  {
    id: 'replicatedstorage',
    name: 'ReplicatedStorage',
    className: 'ReplicatedStorage',
    icon: 'database',
    parentId: null,
    summary: 'Shared assets and remote events visible to both sides.'
  },
  {
    id: 'serverscriptservice',
    name: 'ServerScriptService',
    className: 'ServerScriptService',
    icon: 'server',
    parentId: null,
    summary: 'Authoritative server scripts gated by the manifest validator.'
  },
  {
    id: 'serverstorage',
    name: 'ServerStorage',
    className: 'ServerStorage',
    icon: 'database',
    parentId: null,
    summary: 'Server-only assets never replicated to clients.'
  },
  {
    id: 'startergui',
    name: 'StarterGui',
    className: 'StarterGui',
    icon: 'gui',
    parentId: null,
    summary: 'HUD elements cloned into each player on join.'
  },
  {
    id: 'starterpack',
    name: 'StarterPack',
    className: 'StarterPack',
    icon: 'backpack',
    parentId: null,
    summary: 'Tools granted to every player at spawn.'
  },
  {
    id: 'starterplayer',
    name: 'StarterPlayer',
    className: 'StarterPlayer',
    icon: 'player',
    parentId: null,
    summary: 'Character controller tuning and spawn behaviour.'
  },
  {
    id: 'soundservice',
    name: 'SoundService',
    className: 'SoundService',
    icon: 'sound',
    parentId: null,
    summary: 'Global mixer for music and sound effects.'
  },
  {
    id: 'testservice',
    name: 'TestService',
    className: 'TestService',
    icon: 'test',
    parentId: null,
    summary: 'Automated playtest harness configuration.'
  }
];

const SERVICE_INDEX = new Map<string, StudioServiceNode>(
  STUDIO_SERVICES.map((service) => [service.id, service])
);

export function getStudioService(id: string): StudioServiceNode | null {
  return SERVICE_INDEX.get(id) ?? null;
}

export function isStudioServiceId(id: unknown): id is StudioServiceId {
  return typeof id === 'string' && SERVICE_INDEX.has(id);
}

export function topLevelServices(): StudioServiceNode[] {
  return STUDIO_SERVICES.filter((service) => service.parentId === null);
}

export function childServices(parentId: StudioServiceId): StudioServiceNode[] {
  return STUDIO_SERVICES.filter((service) => service.parentId === parentId);
}
