// Pre-configured Starter Scene Templates for Mochi Studio Experience Hub
// Baseplate, Flat Terrain, and Obby obstacle course starter templates

import type { StudioObject } from '../studioDefaults';

export type StudioSceneObject = StudioObject;

export interface StudioTemplateDefinition {
  id: string;
  name: string;
  description: string;
  previewType: string;
  objects: StudioSceneObject[];
  scriptCode: string;
  grid?: number;
  hasSpawn?: boolean;
  hasHazard?: boolean;
  hasGoal?: boolean;
}

export const MAX_MANIFEST_BYTES = 65536; // 64KB strict boundary

const BASEPLATE_TEMPLATE: StudioTemplateDefinition = {
  id: 'baseplate',
  name: 'Baseplate',
  description: 'Dark slate 64x64 grid platform with central spawn pad and starter Lua script.',
  previewType: 'grid',
  grid: 64,
  hasSpawn: true,
  objects: [
    {
      id: 'baseplate_grid_platform',
      name: 'Baseplate_Platform',
      type: 'platform',
      position: { x: 0, y: -0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 64, y: 1, z: 64 },
      color: '#282830',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'baseplate_spawn_point',
      name: 'SpawnPoint',
      type: 'spawn',
      position: { x: 0, y: 0.1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 4, y: 0.2, z: 4 },
      color: '#00a2ff',
      material: 'neon',
      anchored: true,
      canCollide: true,
      luaScript: '-- Baseplate Spawn Origin\nworld.setSpawnPoint(script.parent.position)'
    }
  ],
  scriptCode: `-- Mochi Studio Baseplate Starter Script\nprint("Baseplate")\nlocal spawnPoint = script.parent\nprint("Baseplate scene ready. Add objects from the palette or write custom Lua scripts.")`
};

const FLAT_TERRAIN_TEMPLATE: StudioTemplateDefinition = {
  id: 'flat_terrain',
  name: 'Flat Terrain',
  description: 'Expansive 80x80 grassy terrain with spawn point and scenic elevation platforms.',
  previewType: 'terrain',
  grid: 80,
  hasSpawn: true,
  objects: [
    {
      id: 'terrain_grass_ground',
      name: 'Grass_Terrain',
      type: 'platform',
      position: { x: 0, y: -0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 80, y: 1, z: 80 },
      color: '#15803d',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'terrain_spawn_point',
      name: 'SpawnPoint',
      type: 'spawn',
      position: { x: 0, y: 0.1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 4, y: 0.2, z: 4 },
      color: '#00a2ff',
      material: 'neon',
      anchored: true,
      canCollide: true,
      luaScript: '-- Terrain Spawn Origin\nworld.setSpawnPoint(script.parent.position)'
    },
    {
      id: 'terrain_scenic_hill_north',
      name: 'Scenic_Hill_North',
      type: 'platform',
      position: { x: -20, y: 2, z: -20 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 14, y: 4, z: 14 },
      color: '#166534',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'terrain_scenic_hill_east',
      name: 'Scenic_Hill_East',
      type: 'platform',
      position: { x: 22, y: 3, z: 18 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 16, y: 6, z: 16 },
      color: '#14532d',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'terrain_scenic_pillar',
      name: 'Scenic_Pillar',
      type: 'block',
      position: { x: 0, y: 2, z: -15 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 4, z: 2 },
      color: '#64748b',
      material: 'metal',
      anchored: true,
      canCollide: true
    }
  ],
  scriptCode: `-- Mochi Studio Flat Terrain Script\nworld.setTime("12:00")\nprint("Flat Terrain world initialized with midday sunlight")\nlocal ground = script.parent`
};

const OBBY_TEMPLATE: StudioTemplateDefinition = {
  id: 'obby',
  name: 'Obby',
  description: 'Obstacle course with spawn island, neon jump steps, hazard lava floor, checkpoint, and victory podium.',
  previewType: 'course',
  hasSpawn: true,
  hasHazard: true,
  hasGoal: true,
  objects: [
    {
      id: 'obby_spawn_island',
      name: 'Spawn_Island',
      type: 'platform',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 8, y: 1, z: 8 },
      color: '#3b82f6',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_spawn_pad',
      name: 'SpawnPoint',
      type: 'spawn',
      position: { x: 0, y: 0.6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.2, z: 3 },
      color: '#00a2ff',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_hazard_lava',
      name: 'Lava_Hazard_Floor',
      type: 'hazard',
      position: { x: 0, y: -6, z: 28 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 40, y: 1, z: 80 },
      color: '#ef4444',
      material: 'neon',
      anchored: true,
      canCollide: true,
      luaScript: 'local hazard = script.parent\nhazard.onTouch(function(player)\n  player.takeDamage(100)\n  player.respawn()\nend)'
    },
    {
      id: 'obby_step_1',
      name: 'Neon_Step_1',
      type: 'platform',
      position: { x: 0, y: 1, z: 8 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.5, z: 3 },
      color: '#a855f7',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_step_2',
      name: 'Neon_Step_2',
      type: 'platform',
      position: { x: 3, y: 2.5, z: 15 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.5, z: 3 },
      color: '#ec4899',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_step_3',
      name: 'Neon_Step_3',
      type: 'platform',
      position: { x: -3, y: 4, z: 22 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.5, z: 3 },
      color: '#06b6d4',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_step_4',
      name: 'Neon_Step_4',
      type: 'platform',
      position: { x: 0, y: 5.5, z: 29 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.5, z: 3 },
      color: '#eab308',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_checkpoint',
      name: 'Checkpoint_Platform',
      type: 'platform',
      position: { x: 0, y: 6.5, z: 37 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 6, y: 1, z: 6 },
      color: '#10b981',
      material: 'plastic',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_goal_podium',
      name: 'Victory_Podium',
      type: 'platform',
      position: { x: 0, y: 8, z: 48 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 6, y: 2, z: 6 },
      color: '#f59e0b',
      material: 'neon',
      anchored: true,
      canCollide: true
    },
    {
      id: 'obby_goal_trophy',
      name: 'Victory_Trophy',
      type: 'coin',
      position: { x: 0, y: 10, z: 48 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1.5, y: 1.5, z: 1.5 },
      color: '#fbbf24',
      material: 'neon',
      anchored: true,
      canCollide: true,
      luaScript: 'local coin = script.parent\ncoin.onTouch(function(player)\n  player.addScore("Wins", 1)\n  ui.showNotification("Course Completed! Victory!", 3)\nend)'
    }
  ],
  scriptCode: `-- Mochi Studio Obby Course Script\nlocal function takeDamage(amount)\n  local player = world.getLocalPlayer()\n  if player then\n    player.takeDamage(100)\n    player.respawn()\n  end\nend\nprint("Obby course ready with checkpoint validation")`
};

export const STUDIO_TEMPLATES: StudioTemplateDefinition[] = [
  BASEPLATE_TEMPLATE,
  FLAT_TERRAIN_TEMPLATE,
  OBBY_TEMPLATE
];

export function getTemplateById(id: string): StudioTemplateDefinition | undefined {
  return STUDIO_TEMPLATES.find((t) => t.id === id);
}

export function validateTemplateManifestBytes(template: StudioTemplateDefinition): boolean {
  const serialized = JSON.stringify({
    objects: template.objects,
    scriptCode: template.scriptCode,
    version: '0.1.0'
  });
  return new TextEncoder().encode(serialized).length <= MAX_MANIFEST_BYTES;
}
