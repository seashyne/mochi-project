// Lua-facing proxies for live nodes, the local player and the world.
// Everything here is bound to real runtime objects — no logging stubs.

import { AudioBus } from './audioBus';
import { GameState } from './gameState';
import { LiveNode } from './liveNode';
import { resolveLuaClass } from './nodeFactory';
import { defineAlias, lastFunction } from './luaProxyUtils';
import { attachNodeSignals, notifyChanged } from './nodeSignals';
import { rotationMatrix } from '../physics/oriented';
import { makeCFrameValue, readCFrameValue } from './cframeBridge';
import { attachMaterialProps } from './luaMaterialProps';
import { createRaycast } from './luaRaycast';

import { routeSound } from './audioRouting';
export { createPlayerApi } from './luaPlayerApi';
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

/** Re-exported so existing importers keep working; it lives in luaProxyUtils now. */
export { lastFunction };

function firstString(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (typeof arg === 'string') return arg;
  }
  return undefined;
}

function applyPosition(node: LiveNode, args: unknown[]): void {
  const first = args[0];
  if (first && typeof first === 'object') {
    const vec = toVec3(first);
    node.setPosition(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Position');
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
    notifyChanged(node, 'Name');
  });
  defineAlias(proxy, ['type', 'ClassName'], () => node.type, () => undefined);
  defineAlias(proxy, ['position', 'Position'], () => node.position, (value) => {
    const vec = toVec3(value);
    node.setPosition(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Position');
  });
  defineAlias(proxy, ['rotation', 'Rotation'], () => node.rotation, (value) => {
    const vec = toVec3(value);
    node.setRotation(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Rotation');
  });
  defineAlias(proxy, ['size', 'Size', 'scale', 'Scale'], () => node.scale, (value) => {
    const vec = toVec3(value, { x: 1, y: 1, z: 1 });
    node.setScale(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Size');
  });
  defineAlias(proxy, ['visible', 'Visible'], () => node.visible, (value) => {
    node.setVisible(Boolean(value));
    notifyChanged(node, 'Visible');
  });
  defineAlias(proxy, ['anchored', 'Anchored'], () => node.anchored, (value) => {
    node.anchored = Boolean(value);
    notifyChanged(node, 'Anchored');
  });
  defineAlias(proxy, ['color', 'Color'], () => node.def.color, (value) => {
    node.setColor(parseColor(value, node.def.color));
    notifyChanged(node, 'Color');
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

  attachNodeSignals(proxy, node);

  proxy.setVisible = (value: unknown) => {
    node.setVisible(Boolean(value));
    notifyChanged(node, 'Visible');
  };
  proxy.setPosition = (...args: unknown[]) => {
    applyPosition(node, args);
    notifyChanged(node, 'Position');
  };
  proxy.setRotation = (...args: unknown[]) => {
    const vec = toVec3(args[0] && typeof args[0] === 'object' ? args[0] : { x: args[0], y: args[1], z: args[2] });
    node.setRotation(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Rotation');
  };
  proxy.setScale = (...args: unknown[]) => {
    const vec = toVec3(args[0] && typeof args[0] === 'object' ? args[0] : { x: args[0], y: args[1], z: args[2] }, { x: 1, y: 1, z: 1 });
    node.setScale(vec.x, vec.y, vec.z);
    notifyChanged(node, 'Size');
  };
  proxy.setColor = (value: unknown) => {
    node.setColor(parseColor(value, node.def.color));
    notifyChanged(node, 'Color');
  };
  defineAlias(
    proxy,
    ['CFrame'],
    () => makeCFrameValue(node.position, rotationMatrix(node.rotation)),
    (value) => {
      const parsed = readCFrameValue(value);
      if (!parsed) return;
      node.setPosition(parsed.position.x, parsed.position.y, parsed.position.z);
      node.setRotation(parsed.rotation.x, parsed.rotation.y, parsed.rotation.z);
    }
  );
  attachMaterialProps(proxy, node, deps);

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
  // The world exists before a script starts, so waiting for a child is a lookup that
  // cannot block. It is an alias rather than a yield so a missing name returns nil
  // instead of hanging the script.
  proxy.WaitForChild = proxy.FindFirstChild;
  proxy.IsA = (className: unknown) => String(className ?? '').toLowerCase().replace(/[\s_-]/g, '') === node.type.replace(/_/g, '');

  node.luaProxy = proxy;
  return proxy;
}

/** World proxy backed by the runtime registry, physics gravity and audio bus. */
export function createWorldApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const api: Record<string, unknown> = {};

  api.playSound = (...args: unknown[]) => {
    const name = firstString(args) ?? 'click';
    const position = args.find((arg) => arg && typeof arg === 'object') as RuntimeVec3 | undefined;
    // Access id or URL -> uploaded sample; anything else -> built-in recipe.
    routeSound(deps.audio, name, position ? toVec3(position) : undefined);
    deps.log('info', `[Audio] ${name}`, 'world');
  };

  /** Warms the sample cache, so a first play is not silent. */
  api.loadSound = (source: unknown) => {
    const name = String(source ?? '');
    if (name) void deps.audio.loadSample(name);
  };

  api.Raycast = createRaycast(deps, {
    resolveNode: nodeFromLuaValue,
    wrapNode: (node) => createLuaNode(node, deps)
  });

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
