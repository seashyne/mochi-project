// The guard every ported avatar script writes before touching a humanoid:
//
//   local humanoid = character:FindFirstChild("Humanoid")
//   if humanoid and humanoid.Health > 0 then ... end
//
// Without it the script dies on a nil index, so the lookup is not a nicety.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeApiDeps, createPlayerApi } from '../src/engine/runtime/luaNodeApi';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';
import * as THREE from 'three';

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
  respawn(): void { this.health = 100; }
  damage(amount: number): void { this.health -= amount; }
  heal(amount: number): void { this.health += amount; }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

describe('character lookup', () => {
  let player: StubPlayer;
  let api: Record<string, unknown>;

  beforeEach(() => {
    player = new StubPlayer();
    const deps = {
      world: new RuntimeWorld(new THREE.Scene(), new PhysicsWorld()),
      player,
      audio: { play: vi.fn(), setListener: () => undefined, setMuted: () => undefined, isMuted: () => false },
      state: new GameState(),
      log: () => undefined,
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0
    } as unknown as RuntimeApiDeps;
    api = createPlayerApi(deps);
  });

  afterEach(() => {
    player.health = 100;
  });

  it('finds the humanoid by name', () => {
    const character = api.Character as { FindFirstChild: (name: string) => unknown };
    expect(character.FindFirstChild('Humanoid')).toBe((api.Character as { Humanoid: unknown }).Humanoid);
  });

  it('returns nil for a child it does not have', () => {
    const character = api.Character as { FindFirstChild: (name: string) => unknown };
    expect(character.FindFirstChild('HumanoidRootPart')).toBeUndefined();
  });

  it('waits for the humanoid the same way, since it is always present', () => {
    const character = api.Character as { WaitForChild: (name: string) => unknown };
    expect(character.WaitForChild('Humanoid')).toBe((api.Character as { Humanoid: unknown }).Humanoid);
  });

  it('heals through the humanoid', () => {
    const humanoid = (api.Character as { Humanoid: { Heal: (n: number) => void } }).Humanoid;
    player.health = 40;
    humanoid.Heal(25);
    expect(player.health).toBe(65);
  });
});
