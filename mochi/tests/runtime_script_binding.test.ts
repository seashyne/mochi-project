// Proves the runtime bindings are real: the default coin script must score, hide the
// coin and fire audio; Instance.new must create nodes; script.parent must be live.

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

class FakePlayer implements RuntimePlayerHandle {
  readonly id = 'player_local';
  readonly name = 'Tester';
  position: RuntimeVec3 = { x: 0, y: 2, z: 0 };
  velocity: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  health = 100;
  respawns = 0;

  getPosition(): RuntimeVec3 {
    return this.position;
  }
  setPosition(x: number, y: number, z: number): void {
    this.position = { x, y, z };
  }
  setVelocity(x: number, y: number, z: number): void {
    this.velocity = { x, y, z };
  }
  applyImpulse(x: number, y: number, z: number): void {
    this.velocity = { x: this.velocity.x + x, y: this.velocity.y + y, z: this.velocity.z + z };
  }
  respawn(): void {
    this.respawns += 1;
    this.health = 100;
  }
  damage(amount: number): void {
    this.health -= amount;
  }
  heal(amount: number): void {
    this.health += amount;
  }
  getHealth(): number {
    return this.health;
  }
  setHealth(value: number): void {
    this.health = value;
  }
  getMaxHealth(): number {
    return 100;
  }
}

function makeCoin(script: string): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS.coin;
  return {
    id: 'coin_1',
    name: 'Coin_1',
    type: 'coin',
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { ...defaults.defaultScale },
    color: defaults.defaultColor,
    anchored: true,
    canCollide: true,
    luaScript: script
  };
}

describe('Runtime Lua bindings', () => {
  let world: RuntimeWorld;
  let state: GameState;
  let player: FakePlayer;
  let audio: { play: ReturnType<typeof vi.fn>; setListener: () => void; setMuted: () => void; isMuted: () => boolean };
  let logs: Array<{ level: string; message: string }>;
  let deps: RuntimeApiDeps;
  let spawnPoint: RuntimeVec3;
  let playerApi: Record<string, unknown>;

  beforeEach(() => {
    world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    state = new GameState();
    player = new FakePlayer();
    audio = { play: vi.fn(), setListener: () => undefined, setMuted: () => undefined, isMuted: () => false };
    logs = [];
    spawnPoint = { x: 0, y: 2, z: 0 };
    deps = {
      world,
      player,
      audio: audio as unknown as AudioBus,
      state,
      log: (level, message) => logs.push({ level, message }),
      setSpawnPoint: (position) => {
        spawnPoint = position;
      },
      getSpawnPoint: () => spawnPoint,
      getTime: () => 0
    };
    playerApi = createPlayerApi(deps);
    deps.playerApi = playerApi;
  });

  afterEach(() => {
    world.clear();
    state.dispose();
  });

  it('runs the default coin script end to end: score, sound, visibility', async () => {
    const coin = makeCoin(OBJECT_TYPE_DEFAULTS.coin.defaultScript!);
    const node = world.spawn(coin);
    const context = new ScriptContext({ node, code: coin.luaScript!, deps });

    await context.start();
    expect(logs.filter((entry) => entry.level === 'error')).toEqual([]);
    expect(node.touchHandlerCount).toBe(1);

    node.emitTouch(playerApi);

    expect(state.getScore('Coins')).toBe(10);
    expect(node.visible).toBe(false);
    expect(audio.play).toHaveBeenCalledWith('coin_pickup', expect.anything());

    context.dispose();
  });

  it('spawns real nodes through Instance.new and links script.parent', async () => {
    const script = [
      'local bridge = Instance.new("Part", nil, { Name = "Bridge", Position = Vector3.new(0, 4, -6), Size = Vector3.new(6, 0.5, 3) })',
      'bridge.Anchored = true',
      'local parentName = script.parent.Name',
      'script.parent.onTouch(function(p)',
      '  local bonus = Instance.new("Coin", nil, { Name = "Bonus", Position = Vector3.new(1, 2, 1) })',
      '  p.addScore("Bonus", 5)',
      'end)',
      'print("bridge=" .. bridge.Name .. " parent=" .. parentName)'
    ].join('\n');

    const node = world.spawn(makeCoin(script));
    const context = new ScriptContext({ node, code: script, deps });
    await context.start();

    const bridge = world.findByName('Bridge');
    expect(bridge).toBeDefined();
    expect(bridge?.def.type).toBe('block');
    expect(bridge?.position.y).toBe(4);
    expect(logs.some((entry) => entry.message.includes('parent=Coin_1'))).toBe(true);

    node.emitTouch(playerApi);
    expect(world.findByName('Bonus')).toBeDefined();
    expect(state.getScore('Bonus')).toBe(5);
    expect(logs.filter((entry) => entry.level === 'error')).toEqual([]);

    context.dispose();
  });

  it('drives physics gravity, spawn point and player respawn from Lua', async () => {
    const script = [
      'world.setGravity(0, -6.5, 0)',
      'world.setSpawnPoint(Vector3.new(3, 4, 5))',
      'local pad = world.findPart("Coin_1")',
      'if pad == nil then print("missing part") end',
      'script.parent.onTouch(function(p) p.respawn() end)'
    ].join('\n');

    const node = world.spawn(makeCoin(script));
    const context = new ScriptContext({ node, code: script, deps });
    await context.start();

    expect(world.getGravity().y).toBe(-6.5);
    expect(spawnPoint).toEqual({ x: 3, y: 4, z: 5 });

    node.emitTouch(playerApi);
    expect(player.respawns).toBe(1);
    expect(logs.filter((entry) => entry.level === 'error')).toEqual([]);

    context.dispose();
  });

  it('ticks onUpdate handlers that mutate the live transform', async () => {
    const script = 'script.onUpdate.Connect(function(dt)\n  script.parent.position.x = script.parent.position.x + dt\nend)';
    const node = world.spawn(makeCoin(script));
    const context = new ScriptContext({ node, code: script, deps });
    await context.start();

    expect(node.updateHandlerCount).toBe(1);
    node.dispatchUpdate(0.5);
    node.dispatchUpdate(0.5);
    expect(node.position.x).toBeCloseTo(1, 5);

    context.dispose();
  });
});
