// Proves the published-game path: a loaded world is adopted (not duplicated), its
// per-object scripts run, and a physics trigger really scores and hides the coin.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld, RigidBody } from '../src/engine/physics';
import { loadWorldFromManifest } from '../src/engine/scene/sceneLoader';
import { GameRuntime } from '../src/engine/runtime/gameRuntime';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';
import { OBJECT_TYPE_DEFAULTS } from '../src/engine/studio/types';

class FakePlayer implements RuntimePlayerHandle {
  readonly id = 'player_1';
  readonly name = 'Tester';
  respawns = 0;
  getPosition(): RuntimeVec3 {
    return { x: 0, y: 2, z: 0 };
  }
  setPosition(): void {}
  setVelocity(): void {}
  applyImpulse(): void {}
  respawn(): void {
    this.respawns += 1;
  }
  damage(): void {}
  heal(): void {}
  getHealth(): number {
    return 100;
  }
  setHealth(): void {}
  getMaxHealth(): number {
    return 100;
  }
}

const ROT = { x: 0, y: 0, z: 0 };

function buildManifest(): string {
  return JSON.stringify({
    objects: [
      {
        id: 'coin_a',
        name: 'Coin A',
        type: 'coin',
        position: { x: 0, y: 2, z: 0 },
        rotation: ROT,
        scale: { x: 1, y: 0.2, z: 1 },
        color: '#fbbf24',
        luaScript: OBJECT_TYPE_DEFAULTS.coin.defaultScript
      },
      {
        id: 'block_a',
        name: 'Block A',
        type: 'block',
        position: { x: 6, y: 0, z: 0 },
        rotation: ROT,
        scale: { x: 2, y: 2, z: 2 },
        color: '#6366f1'
      }
    ]
  });
}

describe('Published game runtime', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let runtime: GameRuntime;

  beforeEach(() => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    physics.gravity = { x: 0, y: 0, z: 0 };
    runtime = new GameRuntime({
      scene,
      physics,
      player: new FakePlayer(),
      playerBodyId: 'player_1',
      log: () => undefined
    });
  });

  it('gives scripted objects their own mesh while plain geometry stays instanced', () => {
    const world = loadWorldFromManifest(scene, buildManifest(), physics);

    expect(world.objects.map((obj) => obj.id)).toEqual(['coin_a', 'block_a']);
    expect(world.bindings.get('coin_a')?.mesh).toBeTruthy();
    expect(world.bindings.get('coin_a')?.body?.id).toBe('coin_coin_a');
    expect(world.bindings.get('block_a')?.mesh).toBeNull();
    expect(world.bindings.get('block_a')?.body?.id).toBe('physics_block_a');
  });

  it('adopts the loaded world and runs the coin script on a real trigger', async () => {
    const world = loadWorldFromManifest(scene, buildManifest(), physics);
    runtime.sync(world.objects, world.bindings);
    await runtime.whenIdle();

    const node = runtime.world.get('coin_a');
    expect(node).toBeDefined();
    expect(node?.touchHandlerCount).toBe(1);
    // One instanced batch for the plain block plus exactly one adopted coin mesh.
    const coinMeshes = scene.children.filter(
      (child) => (child.userData as { id?: string }).id === 'coin_a'
    );
    expect(coinMeshes).toHaveLength(1);
    expect(scene.children).toHaveLength(2);

    const playSpy = vi.spyOn(runtime.audio, 'play');
    const visitor = new RigidBody({
      id: 'player_1',
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
      shape: { type: 'sphere', radius: 0.5 }
    });
    physics.addBody(visitor);

    for (let step = 0; step < 3; step += 1) physics.step(1 / 60);

    expect(runtime.state.getScore('Coins')).toBe(10);
    expect(node?.visible).toBe(false);
    expect(world.bindings.get('coin_a')?.mesh?.visible).toBe(false);
    expect(playSpy).toHaveBeenCalledWith('coin_pickup', expect.anything());
  });

  it('runs the world-level script and lets it spawn objects through Instance.new', async () => {
    const world = loadWorldFromManifest(scene, buildManifest(), physics);
    runtime.sync(world.objects, world.bindings);
    runtime.runWorldScript('local p = Instance.new("Part", nil, { Name = "Spawned", Position = Vector3.new(1, 3, 1) })');
    await runtime.whenIdle();

    const spawned = runtime.world.findByName('Spawned');
    expect(spawned).toBeDefined();
    expect(spawned?.dynamic).toBe(true);
    expect(scene.children.some((child) => child.name === 'Spawned')).toBe(true);
  });
});
