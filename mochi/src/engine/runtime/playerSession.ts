// Wiring for a published-game session: adapts the viewport's character controller and
// room client to the runtime's player/network contracts, so the viewport stays thin.

import * as THREE from 'three';
import { CharacterPhysicsController, PhysicsWorld, RigidBody } from '../physics';
import { FollowCamera } from '../camera/followCamera';
import { MultiplayerManager } from '../multiplayerManager';
import { GameRuntime } from './gameRuntime';
import { SessionConsole } from './sessionConsole';
import { RuntimeLogSink, RuntimeNetworkAdapter, RuntimePlayerHandle, WorldOp } from './types';

export interface PlayerSessionOptions {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  multiplayer: MultiplayerManager;
  controller: CharacterPhysicsController;
  body: RigidBody;
  playerId: string;
  playerName: string;
  log?: RuntimeLogSink;
  consoleSession?: SessionConsole;
}

export interface PlayerSession {
  runtime: GameRuntime;
  player: RuntimePlayerHandle;
  dispose: () => void;
}

function defaultLog(level: 'info' | 'warn' | 'error', message: string, source?: string): void {
  const line = source ? `[${source}] ${message}` : message;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Adapts a physics character controller to the handle scripts are allowed to drive. */
export function createPlayerHandle(
  controller: CharacterPhysicsController,
  body: RigidBody,
  id: string,
  name: string
): RuntimePlayerHandle {
  const health = { value: 100 };
  return {
    id,
    name,
    getPosition: () => controller.getPosition(),
    setPosition: (x, y, z) => {
      body.setPosition(x, y, z);
      body.updateAABB();
    },
    setVelocity: (x, y, z) => body.setVelocity(x, y, z),
    applyImpulse: (x, y, z) => body.applyImpulse({ x, y, z }),
    respawn: () => controller.respawn(),
    damage: (amount) => {
      health.value = Math.max(0, health.value - amount);
      if (health.value <= 0) controller.respawn();
    },
    heal: (amount) => {
      health.value = Math.min(100, health.value + amount);
    },
    getHealth: () => health.value,
    setHealth: (value) => {
      health.value = value;
    },
    getMaxHealth: () => 100
  };
}

/** Bridges scripts onto the room client: RPC, replicated state and world ops. */
export function createMultiplayerNetwork(multiplayer: MultiplayerManager): RuntimeNetworkAdapter & { dispose: () => void } {
  const replicated = new Map<string, unknown>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const emit = (event: string, data: unknown) => {
    listeners.get(event)?.forEach((handler) => handler(data));
  };

  const unsubscribeRpc = multiplayer.onScriptRpc((event, data) => emit(event, data));
  const unsubscribeState = multiplayer.onStateReplicate((key, value) => {
    replicated.set(key, value);
    emit(`StateChanged_${key}`, value);
  });

  return {
    fireServer: (event, data) => multiplayer.sendScriptRpc(event, data),
    onClientEvent: (event, handler) => {
      const set = listeners.get(event) ?? new Set<(data: unknown) => void>();
      listeners.set(event, set);
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    getState: (key) => replicated.get(key),
    sendWorldOp: (op) => multiplayer.sendWorldOp(op),
    onWorldOp: (handler) => multiplayer.onWorldOp((op) => handler(op as WorldOp)),
    sendTransformDelta: (payload) => multiplayer.sendTransformDelta(payload),
    onTransformDelta: (handler) => multiplayer.onTransformDelta(handler),
    dispose: () => {
      unsubscribeRpc();
      unsubscribeState();
      listeners.clear();
      replicated.clear();
    }
  };
}

export function createPlayerSession(options: PlayerSessionOptions): PlayerSession {
  const player = createPlayerHandle(options.controller, options.body, options.playerId, options.playerName);
  const network = createMultiplayerNetwork(options.multiplayer);
  const runtime = new GameRuntime({
    scene: options.scene,
    physics: options.physics,
    player,
    playerBodyId: options.playerId,
    log: options.log ?? defaultLog,
    consoleSession: options.consoleSession,
    network
  });
  return {
    runtime,
    player,
    dispose: () => {
      runtime.dispose();
      network.dispose();
    }
  };
}

/** Moves the player and the follow camera to a world spawn point. */
export function applySpawnPoint(
  controller: CharacterPhysicsController,
  followCamera: FollowCamera,
  point: { x: number; y: number; z: number } | null
): void {
  if (!point) return;
  controller.setSpawnPoint(point);
  controller.respawn();
  followCamera.setTarget(point);
  followCamera.teleportToTarget();
}

/** Picks the script a world should run: chunked manifest first, then inline fields. */
export function resolveWorldScript(rawManifest: string | undefined, chunkedScript?: string): string | undefined {
  if (chunkedScript) return chunkedScript;
  if (!rawManifest) return undefined;
  try {
    const parsed = JSON.parse(rawManifest) as {
      scripts?: Record<string, { code?: string }>;
      scriptCode?: string;
    };
    return parsed.scripts?.['scripts/main.client.lua']?.code || parsed.scriptCode;
  } catch {
    return undefined;
  }
}
