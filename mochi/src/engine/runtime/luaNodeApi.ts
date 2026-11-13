// Lua-facing proxies for live nodes, the local player and the world.
// Everything here is bound to real runtime objects — no logging stubs.

import { AudioBus } from './audioBus';
import { GameState } from './gameState';
import { LiveNode, TouchHandler, UpdateHandler } from './liveNode';
import { resolveLuaClass } from './nodeFactory';
import { RuntimeWorld } from './objectRegistry';
import {
  parseColor,
  readProp,
  RuntimeLogSink,
  RuntimeNetworkAdapter,
  RuntimePlayerHandle,
  RuntimeVec3,
  toVec3
} from './types';

/** Drives the scene animation state graph from Lua. Absent on worlds without one. */
export interface AnimationBridge {
  setParameter: (name: string, value: boolean | number) => void;
  trigger: (name: string) => void;
  getState: () => string | null;
}

/** Scripted player movement through the pathfinder. Absent when not wired. */
export interface NavigationBridge {
  moveTo: (x: number, z: number, speed?: number) => boolean;
  stop: () => void;
  isMoving: () => boolean;
}

/** Scripted NPC movement. Keys are object ids or display names. */
export interface AgentBridge {
  moveTo: (key: string, x: number, z: number, speed?: number) => boolean;
  stop: (key: string) => void;
  isMoving: (key: string) => boolean;
  position: (key: string) => RuntimeVec3;
}

export interface RuntimeApiDeps {
  world: RuntimeWorld;
  player: RuntimePlayerHandle;
  audio: AudioBus;
  state: GameState;
  log: RuntimeLogSink;
  setSpawnPoint: (position: RuntimeVec3) => void;
  getSpawnPoint: () => RuntimeVec3;
  getTime: () => number;
  /** Shared player proxy so touch callbacks and `players.LocalPlayer` are identical. */
  playerApi?: Record<string, unknown>;
  /** Present for networked sessions (published games); absent in offline playtest. */
  network?: RuntimeNetworkAdapter;
  /**
   * Animation state graph bridge. Looked up on every call rather than captured,
   * so the host can attach it after the world finishes loading.
   */
  animation?: AnimationBridge;
  navigation?: NavigationBridge;
  /** NPC steering. Looked up per call so the host can attach it late. */
  agents?: AgentBridge;
}

/** Maps a Lua userdata proxy back to the node it represents. */
const proxyOwner = new WeakMap<object, LiveNode>();

export function nodeFromLuaValue(value: unknown): LiveNode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return proxyOwner.get(value as object);
}

/** Colon-calls (`obj:Method()`) pass the receiver first, so grab the last function. */
export function lastFunction(args: unknown[]): ((...params: unknown[]) => void) | undefined {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (typeof args[i] === 'function') return args[i] as (...params: unknown[]) => void;
  }
  return undefined;
}

function firstString(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (typeof arg === 'string') return arg;
  }
  return undefined;
}

function defineAlias(
  target: Record<string, unknown>,
  names: string[],
  get: () => unknown,
  set: (value: unknown) => void
): void {
  for (const name of names) {
    Object.defineProperty(target, name, { get, set, enumerable: true, configurable: true });
  }
}

function applyPosition(node: LiveNode, args: unknown[]): void {
  const first = args[0];
  if (first && typeof first === 'object') {
    const vec = toVec3(first);
    node.setPosition(vec.x, vec.y, vec.z);
    return;
  }
  node.setPosition(Number(args[0]) || 0, Number(args[1]) || 0, Number(args[2]) || 0);
}

/** Builds (and caches) the Lua table representing one live node. */
export function createLuaNode(node: LiveNode, deps: RuntimeApiDeps): Record<string, unknown> {
  if (node.luaProxy) return node.luaProxy;

  const proxy: Record<string, unknown> = {};
  proxyOwner.set(proxy, node);
  // Stable object id. `agent.moveTo(script.parent.id, ...)` needs it because
  // display names are not guaranteed unique.
  proxy.id = node.id;

  defineAlias(proxy, ['name', 'Name'], () => node.name, (value) => {
    node.name = String(value ?? '');
  });
  defineAlias(proxy, ['type', 'ClassName'], () => node.type, () => undefined);
  defineAlias(proxy, ['position', 'Position'], () => node.position, (value) => {
    const vec = toVec3(value);
    node.setPosition(vec.x, vec.y, vec.z);
  });
  defineAlias(proxy, ['rotation', 'Rotation'], () => node.rotation, (value) => {
    const vec = toVec3(value);
    node.setRotation(vec.x, vec.y, vec.z);
  });
  defineAlias(proxy, ['size', 'Size', 'scale', 'Scale'], () => node.scale, (value) => {
    const vec = toVec3(value, { x: 1, y: 1, z: 1 });
    node.setScale(vec.x, vec.y, vec.z);
  });
  defineAlias(proxy, ['visible', 'Visible'], () => node.visible, (value) => {
    node.setVisible(Boolean(value));
  });
  defineAlias(proxy, ['anchored', 'Anchored'], () => node.anchored, (value) => {
    node.anchored = Boolean(value);
  });
  defineAlias(proxy, ['color', 'Color'], () => node.def.color, (value) => {
    node.setColor(parseColor(value, node.def.color));
  });
  defineAlias(
    proxy,
    ['parent', 'Parent'],
    () => (node.parent ? createLuaNode(node.parent, deps) : undefined),
    (value) => {
      const parent = nodeFromLuaValue(value);
      deps.world.setParent(node.id, parent ? parent.id : null);
    }
  );

  const connectTouch = (...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) node.addTouchHandler(handler as TouchHandler);
  };
  const connectUpdate = (...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) node.addUpdateHandler(handler as UpdateHandler);
  };

  proxy.onTouch = (...args: unknown[]) => connectTouch(...args);
  proxy.Touched = { Connect: connectTouch };
  proxy.onUpdate = { Connect: connectUpdate };

  proxy.setVisible = (value: unknown) => node.setVisible(Boolean(value));
  proxy.setPosition = (...args: unknown[]) => applyPosition(node, args);
  proxy.setRotation = (...args: unknown[]) => {
    const vec = toVec3(args[0] && typeof args[0] === 'object' ? args[0] : { x: args[0], y: args[1], z: args[2] });
    node.setRotation(vec.x, vec.y, vec.z);
  };
  proxy.setScale = (...args: unknown[]) => {
    const vec = toVec3(args[0] && typeof args[0] === 'object' ? args[0] : { x: args[0], y: args[1], z: args[2] }, { x: 1, y: 1, z: 1 });
    node.setScale(vec.x, vec.y, vec.z);
  };
  proxy.setColor = (value: unknown) => node.setColor(parseColor(value, node.def.color));
  proxy.rotateY = (degrees: unknown) => {
    const radians = ((Number(degrees) || 0) * Math.PI) / 180;
    node.setRotation(node.rotation.x, node.rotation.y + radians, node.rotation.z);
  };
  proxy.setVelocity = (x: unknown, y: unknown, z: unknown) => node.setVelocity(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  proxy.applyImpulse = (x: unknown, y: unknown, z: unknown) => node.applyImpulse(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  proxy.Destroy = () => deps.world.destroy(node.id);
  proxy.destroy = () => deps.world.destroy(node.id);
  proxy.GetChildren = () => node.children.map((child) => createLuaNode(child, deps));
  proxy.FindFirstChild = (name: unknown) => {
    const match = node.children.find((child) => child.name.toLowerCase() === String(name ?? '').toLowerCase());
    return match ? createLuaNode(match, deps) : undefined;
  };
  proxy.findFirstChild = proxy.FindFirstChild;
  proxy.IsA = (className: unknown) => String(className ?? '').toLowerCase().replace(/[\s_-]/g, '') === node.type.replace(/_/g, '');

  node.luaProxy = proxy;
  return proxy;
}

/** Player proxy backed by the real character controller. */
export function createPlayerApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const api: Record<string, unknown> = {};
  defineAlias(api, ['position', 'Position'], () => deps.player.getPosition(), (value) => {
    const vec = toVec3(value);
    deps.player.setPosition(vec.x, vec.y, vec.z);
  });
  defineAlias(api, ['health', 'Health'], () => deps.player.getHealth(), (value) => {
    deps.player.setHealth(Number(value) || 0);
  });
  defineAlias(api, ['maxHealth', 'MaxHealth'], () => deps.player.getMaxHealth(), () => undefined);
  defineAlias(api, ['name', 'Name', 'username', 'Username'], () => deps.player.name, () => undefined);
  api.id = deps.player.id;

  api.addScore = (category: unknown, amount: unknown) => {
    const label = String(category ?? 'Score');
    const total = deps.state.addScore(label, Number(amount) || 0);
    deps.log('info', `Score ${label} = ${total} (+${Number(amount) || 0})`, 'player');
    return total;
  };
  api.getScore = (category: unknown) => deps.state.getScore(String(category ?? 'Score'));
  api.setVelocity = (x: unknown, y: unknown, z: unknown) => deps.player.setVelocity(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  api.applyImpulse = (x: unknown, y: unknown, z: unknown) => deps.player.applyImpulse(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  api.respawn = () => {
    deps.player.respawn();
    deps.audio.play('swoosh');
  };
  api.damage = (amount: unknown) => deps.player.damage(Number(amount) || 0);
  api.heal = (amount: unknown) => deps.player.heal(Number(amount) || 0);
  // Scripted walking through the navigation grid; no-ops without a bridge.
  api.moveTo = (x: unknown, z: unknown, speed?: unknown) => {
    const targetX = Number(x);
    const targetZ = Number(z);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;
    const started = deps.navigation?.moveTo(targetX, targetZ, Number(speed)) ?? false;
    deps.log('info', `[Nav] moveTo(${targetX}, ${targetZ}) ${started ? 'started' : 'unreachable'}`, 'player');
    return started;
  };
  api.stopMoving = () => deps.navigation?.stop();
  api.isMoving = () => deps.navigation?.isMoving() ?? false;
  return api;
}

/** World proxy backed by the runtime registry, physics gravity and audio bus. */
export function createWorldApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const api: Record<string, unknown> = {};

  api.playSound = (...args: unknown[]) => {
    const name = firstString(args) ?? 'click';
    const position = args.find((arg) => arg && typeof arg === 'object') as RuntimeVec3 | undefined;
    deps.audio.play(name, { position: position ? toVec3(position) : undefined });
    deps.log('info', `[Audio] ${name}`, 'world');
  };

  api.createPart = (options: unknown) => {
    const className =
      firstString([
        readProp(options, 'className'),
        readProp(options, 'ClassName'),
        readProp(options, 'type'),
        readProp(options, 'Type')
      ]) ?? 'Part';
    const name = readProp(options, 'name') ?? readProp(options, 'Name');
    const position = readProp(options, 'position') ?? readProp(options, 'Position');
    const size = readProp(options, 'size') ?? readProp(options, 'Size');
    const color = readProp(options, 'color') ?? readProp(options, 'Color');
    const anchored = readProp(options, 'anchored') ?? readProp(options, 'Anchored');

    const node = deps.world.create({
      type: resolveLuaClass(className),
      name: name === undefined ? undefined : String(name),
      position: position ? toVec3(position) : undefined,
      scale: size ? toVec3(size, { x: 2, y: 2, z: 2 }) : undefined,
      color: color === undefined ? undefined : parseColor(color, '#6366f1'),
      anchored: anchored === undefined ? true : Boolean(anchored)
    });
    deps.log('info', `[World] Created ${className} "${node.name}"`, 'world');
    return createLuaNode(node, deps);
  };

  api.findPart = (name: unknown) => {
    const node = deps.world.findByName(String(name ?? ''));
    return node ? createLuaNode(node, deps) : undefined;
  };
  api.findFirstChild = api.findPart;
  api.getParts = () => deps.world.getAll().map((node) => createLuaNode(node, deps));
  api.getPartCount = () => deps.world.count();
  api.setGravity = (...args: unknown[]) => {
    const vec = args[0] && typeof args[0] === 'object' ? toVec3(args[0]) : toVec3({ x: args[0], y: args[1], z: args[2] });
    deps.world.setGravity(vec.x, vec.y, vec.z);
    deps.log('info', `[Physics] Gravity = (${vec.x}, ${vec.y}, ${vec.z})`, 'world');
  };
  api.getGravity = () => deps.world.getGravity();
  api.setSpawnPoint = (position: unknown) => {
    deps.setSpawnPoint(toVec3(position, deps.getSpawnPoint()));
    deps.log('info', '[World] Spawn point updated', 'world');
  };
  api.getSpawnPoint = () => deps.getSpawnPoint();
  api.getTime = () => deps.getTime();
  return api;
}
