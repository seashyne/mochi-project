// Material names from imported scripts.
//
// Ported worlds choose a part's surface by name, and the name is the whole surface.
// Our model splits shading from texture, so the alias table maps one onto the other.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { OBJECT_TYPE_DEFAULTS, StudioObject } from '../src/engine/studio/types';
import { AudioBus } from '../src/engine/runtime/audioBus';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeApiDeps, createPlayerApi } from '../src/engine/runtime/luaNodeApi';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';
import { aliasForSurface, resolveMaterialAlias } from '../src/engine/scene/materialAliases';

class StubPlayer implements RuntimePlayerHandle {
  readonly id = 'player_local';
  readonly name = 'Tester';
  position: RuntimeVec3 = { x: 0, y: 2, z: 0 };
  velocity: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  health = 100;
  getPosition(): RuntimeVec3 { return this.position; }
  setPosition(x: number, y: number, z: number): void { this.position = { x, y, z }; }
  setVelocity(): void { /* unused */ }
  applyImpulse(): void { /* unused */ }
  respawn(): void { /* unused */ }
  damage(): void { /* unused */ }
  heal(): void { /* unused */ }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

describe('material aliases', () => {
  it('maps a surface name onto shading plus a bundled texture set', () => {
    expect(resolveMaterialAlias('Grass')).toEqual({ material: 'plastic', preset: 'grass_field' });
    expect(resolveMaterialAlias('Brick')).toEqual({ material: 'plastic', preset: 'brick_red' });
    expect(resolveMaterialAlias('Wood')).toEqual({ material: 'wood', preset: 'wood_planks' });
    expect(resolveMaterialAlias('Neon')).toEqual({ material: 'neon', preset: null });
  });

  it('ignores case, spaces and underscores', () => {
    for (const name of ['DiamondPlate', 'diamond plate', 'diamond_plate', 'DIAMOND-PLATE']) {
      expect(resolveMaterialAlias(name)?.preset, name).toBe('diamond_plate');
    }
  });

  it('returns null for a name it does not know', () => {
    expect(resolveMaterialAlias('unobtainium')).toBeNull();
    expect(resolveMaterialAlias('')).toBeNull();
  });

  it('reports back the name that was set, not the internal pair', () => {
    expect(aliasForSurface('plastic', 'grass_field')).toBe('Grass');
    expect(aliasForSurface('metal', 'diamond_plate')).toBe('Diamondplate');
    expect(aliasForSurface('glass', null)).toBe('Glass');
    expect(aliasForSurface(undefined, null)).toBe('Plastic');
  });
});

describe('Material in Lua', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let deps: RuntimeApiDeps;
  let logs: Array<{ level: string; message: string }>;
  let contexts: ScriptContext[];

  async function run(script: string) {
    const defaults = OBJECT_TYPE_DEFAULTS.block;
    const def: StudioObject = {
      id: 'part_1',
      name: 'Part_1',
      type: 'block',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...defaults.defaultScale },
      color: defaults.defaultColor,
      anchored: true
    };
    const node = world.spawn(def);
    const context = new ScriptContext({ node, code: script, deps });
    contexts.push(context);
    await context.start();
    return { node, errors: logs.filter((entry) => entry.level === 'error') };
  }

  beforeEach(() => {
    world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    state = new GameState();
    logs = [];
    contexts = [];
    const player = new StubPlayer();
    deps = {
      world,
      player,
      audio: { play: vi.fn(), setListener: () => undefined, setMuted: () => undefined, isMuted: () => false } as unknown as AudioBus,
      state,
      log: (level, message) => logs.push({ level, message }),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0
    };
    deps.playerApi = createPlayerApi(deps);
  });

  afterEach(() => {
    for (const context of contexts) context.dispose();
    world.clear();
    state.dispose();
  });

  it('sets the surface from a script and reads it back', async () => {
    const { node, errors } = await run(`
      script.parent.Material = "Grass"
      print(script.parent.Material)
    `);
    expect(errors).toEqual([]);
    expect(node.def.material).toBe('plastic');
    expect(node.def.materialTexture).toBe('grass_field');
    expect(logs.some((entry) => entry.message === 'Grass')).toBe(true);
  });

  it('leaves the part alone when the name is unknown', async () => {
    const { node, errors } = await run(`
      script.parent.Material = "unobtainium"
    `);
    expect(errors).toEqual([]);
    expect(node.def.materialTexture ?? null).toBeNull();
  });

  it('takes a preset id directly as well', async () => {
    const { node, errors } = await run(`
      script.parent.materialTexture = "marble_white"
    `);
    expect(errors).toEqual([]);
    expect(node.def.materialTexture).toBe('marble_white');
  });
});
