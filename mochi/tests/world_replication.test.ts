// Proves runtime world edits replicate between peers and that replicated state reaches
// Lua through network.getState / StateChanged_<key> — without echoing back to the sender.

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameRuntime } from '../src/engine/runtime/gameRuntime';
import {
  RuntimeNetworkAdapter,
  RuntimePlayerHandle,
  RuntimeVec3,
  WorldOp
} from '../src/engine/runtime/types';

class FakePlayer implements RuntimePlayerHandle {
  readonly id = 'player_1';
  readonly name = 'Tester';
  getPosition(): RuntimeVec3 {
    return { x: 0, y: 2, z: 0 };
  }
  setPosition(): void {}
  setVelocity(): void {}
  applyImpulse(): void {}
  respawn(): void {}
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

class FakeNetwork implements RuntimeNetworkAdapter {
  readonly sent: WorldOp[] = [];
  readonly rpc: Array<{ event: string; data: unknown }> = [];
  readonly state = new Map<string, unknown>();
  private readonly handlers = new Map<string, Set<(data: unknown) => void>>();
  private readonly opHandlers = new Set<(op: WorldOp) => void>();

  fireServer(event: string, data?: unknown): void {
    this.rpc.push({ event, data });
  }

  onClientEvent(event: string, handler: (data: unknown) => void): () => void {
    const set = this.handlers.get(event) ?? new Set<(data: unknown) => void>();
    this.handlers.set(event, set);
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  getState(key: string): unknown {
    return this.state.get(key);
  }

  sendWorldOp(op: WorldOp): void {
    this.sent.push(op);
  }

  onWorldOp(handler: (op: WorldOp) => void): () => void {
    this.opHandlers.add(handler);
    return () => {
      this.opHandlers.delete(handler);
    };
  }

  emit(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  receive(op: WorldOp): void {
    this.opHandlers.forEach((handler) => handler(op));
  }
}

describe('World replication', () => {
  let scene: THREE.Scene;
  let network: FakeNetwork;
  let runtime: GameRuntime;

  beforeEach(() => {
    scene = new THREE.Scene();
    network = new FakeNetwork();
    runtime = new GameRuntime({
      scene,
      physics: new PhysicsWorld(),
      player: new FakePlayer(),
      playerBodyId: 'player_1',
      log: () => undefined,
      network
    });
  });

  it('broadcasts Instance.new spawns and never echoes remote ones', async () => {
    runtime.runWorldScript('Instance.new("Part", nil, { Name = "Bullet", Position = Vector3.new(0, 3, 0) })');
    await runtime.whenIdle();

    const spawn = network.sent.find((op) => op.kind === 'spawn');
    expect(spawn).toBeDefined();
    if (spawn?.kind !== 'spawn') throw new Error('expected spawn op');
    expect(spawn.object.name).toBe('Bullet');
    expect(spawn.object.luaScript).toBeUndefined();

    // A peer replay must not be re-broadcast.
    const before = network.sent.length;
    network.receive(spawn);
    expect(network.sent).toHaveLength(before);
  });

  it('replays a peer spawn as a live node without running its script', () => {
    network.receive({
      kind: 'spawn',
      object: {
        id: 'peer_coin',
        name: 'Peer Coin',
        type: 'coin',
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 0.2, z: 1 },
        color: '#fbbf24'
      }
    });

    const node = runtime.world.get('peer_coin');
    expect(node).toBeDefined();
    expect(node?.remote).toBe(true);
    expect(node?.touchHandlerCount).toBe(0);
    expect(scene.children.some((child) => child.userData?.id === 'peer_coin')).toBe(true);
  });

  it('removes a node when a peer destroys it', () => {
    network.receive({
      kind: 'spawn',
      object: {
        id: 'peer_block',
        name: 'Peer Block',
        type: 'block',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#6366f1'
      }
    });
    expect(runtime.world.get('peer_block')).toBeDefined();

    network.receive({ kind: 'destroy', id: 'peer_block' });
    expect(runtime.world.get('peer_block')).toBeUndefined();
  });

  it('delivers replicated state to Lua through getState and StateChanged events', async () => {
    runtime.runWorldScript([
      'network.OnClientEvent("StateChanged_score", function(value)',
      '  ui.showNotification("score " .. tostring(value))',
      'end)',
      'print("cached=" .. tostring(network.getState("score")))'
    ].join('\n'));
    await runtime.whenIdle();

    network.state.set('score', 42);
    network.emit('StateChanged_score', 42);

    const notifications = runtime.state.getSnapshot().notifications;
    expect(notifications.some((toast) => toast.message === 'score 42')).toBe(true);
  });

  it('forwards FireServer calls to the room client', async () => {
    runtime.runWorldScript('network.FireServer("hit", { damage = 5 })');
    await runtime.whenIdle();

    expect(network.rpc.some((call) => call.event === 'hit')).toBe(true);
  });
});
