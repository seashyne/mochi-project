// Default Scene Objects and Starter Lua Script for Mochi Creator Studio

import { StudioObject } from '../../engine/studio/types';

export type { StudioObject };

export const DEFAULT_LUA_SCRIPT = `-- Mochi 3D Game Script (Lua 5.4 Sandbox)
local coin = script.parent
script.onUpdate.Connect(function(dt)
  coin.rotateY(90 * dt)
end)
coin.onTouch(function(player)
  player.addScore("Coins", 10)
  world.playSound("coin_pickup")
  ui.showNotification("Collected 10 Coins!", 2)
  coin.setVisible(false)
  task.wait(3, function() coin.setVisible(true) end)
end)
print("Mochi Lua script loaded")`;

// Every new project opens on a baseplate with a spawn pad, so the viewport is a
// playable starting point instead of an empty void. The baseplate sits at y=0 so
// the camera rig and character controller both start on solid ground.
export const INITIAL_STUDIO_OBJECTS: StudioObject[] = [
  {
    id: 'obj_baseplate',
    name: 'Baseplate',
    type: 'block',
    position: { x: 0, y: -0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 64, y: 1, z: 64 },
    color: '#4b4b57',
    material: 'plastic',
    anchored: true,
    canCollide: true,
    luaScript: '-- Baseplate: anchored ground for the whole scene'
  },
  {
    id: 'obj_spawn_1',
    name: 'SpawnLocation',
    type: 'spawn',
    position: { x: 0, y: 0.1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 4, y: 0.2, z: 4 },
    color: '#00a2ff',
    material: 'neon',
    anchored: true,
    canCollide: true,
    luaScript: '-- Initial spawn origin\nworld.setSpawnPoint(script.parent.position)'
  }
];

/** Fresh copies so a new draft never shares object references with the template. */
export function createStarterObjects(): StudioObject[] {
  return INITIAL_STUDIO_OBJECTS.map((object) => ({
    ...object,
    position: { ...object.position },
    rotation: { ...object.rotation },
    scale: { ...object.scale }
  }));
}
