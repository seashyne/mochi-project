// Assembles the Lua globals a script sees: ui, Instance, Vector3/Color3, script.
// `task` and `wait` are defined by the Lua prelude (luaPrelude.ts), not here.
// ui.* writes go to the real HUD store; Instance.new really spawns nodes in the world.

import { defaultReactLuaStore } from '../lua/reactLuaBridge';
import { LuaDialogueOptions } from '../lua/types';
import { createLuaNode, createPlayerApi, createWorldApi, nodeFromLuaValue, RuntimeApiDeps } from './luaNodeApi';
import { resolveLuaClass } from './nodeFactory';
import { LiveNode } from './liveNode';
import { parseColor, readProp, toVec3 } from './types';

function firstString(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (typeof arg === 'string') return arg;
  }
  return undefined;
}

function toChoiceList(value: unknown): string[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const list = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    const choices = list.filter((item) => typeof item === 'string').map(String);
    return choices.length > 0 ? choices : undefined;
  } catch {
    return undefined;
  }
}

/** UI proxy: notifications, leaderboard and the existing React dialogue/HUD store. */
export function createUiApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const api: Record<string, unknown> = {};
  api.showNotification = (message: unknown, duration: unknown) => {
    const text = String(message ?? '');
    deps.state.notify(text, Number(duration) || 2.4);
    deps.log('info', `[UI] ${text}`, 'ui');
  };
  api.setLeaderboard = (category: unknown, score: unknown) => {
    const label = String(category ?? 'Score');
    const value = Number(score) || 0;
    deps.state.setLeaderboard(label, value);
    deps.log('info', `[Leaderboard] ${label}: ${value}`, 'ui');
  };
  api.showDialogue = (options: unknown) => {
    const choiceHandler = readProp(options, 'onChoice');
    defaultReactLuaStore.showDialogue({
      speaker: readProp(options, 'speaker') ? String(readProp(options, 'speaker')) : undefined,
      text: String(readProp(options, 'text') ?? ''),
      avatar: readProp(options, 'avatar') ? String(readProp(options, 'avatar')) : undefined,
      choices: toChoiceList(readProp(options, 'choices')),
      onChoice: typeof choiceHandler === 'function' ? (choiceHandler as LuaDialogueOptions['onChoice']) : undefined
    });
  };
  api.hideDialogue = () => defaultReactLuaStore.hideDialogue();
  api.setHud = (id: unknown, element: unknown) => {
    defaultReactLuaStore.setHud(String(id), {
      title: readProp(element, 'title') ? String(readProp(element, 'title')) : String(id),
      value: readProp(element, 'value') as string | number | undefined,
      progress: typeof readProp(element, 'progress') === 'number' ? (readProp(element, 'progress') as number) : undefined,
      color: readProp(element, 'color') ? String(readProp(element, 'color')) : undefined
    });
  };
  api.removeHud = (id: unknown) => defaultReactLuaStore.removeHud(String(id));
  return api;
}

/** `Instance.new("Part", parent, { ... })` — spawns a real node in the running world. */
export function createInstanceApi(deps: RuntimeApiDeps): Record<string, unknown> {
  return {
    new: (...args: unknown[]) => {
      const className = firstString(args) ?? 'Part';
      let parentNode: LiveNode | undefined;
      let props: unknown;
      for (const arg of args) {
        if (!arg || typeof arg !== 'object') continue;
        const candidate = nodeFromLuaValue(arg);
        if (candidate) parentNode = candidate;
        else if (props === undefined) props = arg;
      }

      const nameRaw = readProp(props, 'Name') ?? readProp(props, 'name');
      const posRaw = readProp(props, 'Position') ?? readProp(props, 'position');
      const sizeRaw = readProp(props, 'Size') ?? readProp(props, 'size');
      const colorRaw = readProp(props, 'Color') ?? readProp(props, 'color');
      const anchoredRaw = readProp(props, 'Anchored') ?? readProp(props, 'anchored');
      const collideRaw = readProp(props, 'CanCollide') ?? readProp(props, 'canCollide');

      const node = deps.world.create({
        type: resolveLuaClass(className),
        name: nameRaw === undefined ? undefined : String(nameRaw),
        position: posRaw === undefined ? undefined : toVec3(posRaw),
        scale: sizeRaw === undefined ? undefined : toVec3(sizeRaw, { x: 2, y: 2, z: 2 }),
        color: colorRaw === undefined ? undefined : parseColor(colorRaw),
        anchored: anchoredRaw === undefined ? undefined : Boolean(anchoredRaw),
        canCollide: collideRaw === undefined ? undefined : Boolean(collideRaw)
      });

      if (parentNode) deps.world.setParent(node.id, parentNode.id);
      deps.log('info', `[Instance] ${className} "${node.name}" created`, 'instance');
      return createLuaNode(node, deps);
    }
  };
}

/** `network` proxy: real RPC when a session is connected, inert otherwise. */
function createNetworkApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const adapter = deps.network;
  if (!adapter) {
    return {
      FireServer: () => undefined,
      fireServer: () => undefined,
      OnClientEvent: () => undefined,
      GetState: () => undefined,
      getState: () => undefined
    };
  }
  return {
    FireServer: (event: unknown, data?: unknown) => adapter.fireServer(String(event ?? ''), data),
    fireServer: (event: unknown, data?: unknown) => adapter.fireServer(String(event ?? ''), data),
    OnClientEvent: (...args: unknown[]) => {
      const event = firstString(args);
      const handler = [...args].reverse().find((arg) => typeof arg === 'function');
      if (!event || typeof handler !== 'function') return;
      adapter.onClientEvent(event, handler as (data: unknown) => void);
    },
    GetState: (key: unknown) => adapter.getState?.(String(key ?? '')),
    getState: (key: unknown) => adapter.getState?.(String(key ?? ''))
  };
}

/** Builds the full global table injected into one script context. */
/** `animation.*` drives the scene state graph. No-ops when the world ships none. */
export function createAnimationApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const bridge = () => deps.animation;

  return {
    setParameter: (name: unknown, value: unknown) => {
      const target = bridge();
      if (!target) return;
      if (typeof value === 'number') target.setParameter(String(name), value);
      else target.setParameter(String(name), Boolean(value));
    },
    setBool: (name: unknown, value: unknown) => {
      bridge()?.setParameter(String(name), Boolean(value));
    },
    setNumber: (name: unknown, value: unknown) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      bridge()?.setParameter(String(name), numeric);
    },
    trigger: (name: unknown) => {
      bridge()?.trigger(String(name));
    },
    // wasmoon cannot return JS null (it probes .then) and a JS undefined yields
    // zero Lua values, which breaks `tostring(x)`. Empty string is the safe miss.
    getState: () => bridge()?.getState() ?? ''
  };
}

/** `agent.*` walks NPC objects. No-ops when the runtime has no agent support. */
export function createAgentApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const bridge = () => deps.agents;
  const key = (value: unknown) => String(value ?? '');

  return {
    moveTo: (id: unknown, x: unknown, z: unknown, speed?: unknown) => {
      const targetX = Number(x);
      const targetZ = Number(z);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;
      const started = bridge()?.moveTo(key(id), targetX, targetZ, Number(speed)) ?? false;
      deps.log(
        'info',
        `[Nav] agent "${key(id)}" moveTo(${targetX}, ${targetZ}) ${started ? 'started' : 'unreachable'}`,
        'agent'
      );
      return started;
    },
    stop: (id: unknown) => bridge()?.stop(key(id)),
    isMoving: (id: unknown) => bridge()?.isMoving(key(id)) ?? false,
    // wasmoon cannot return null and undefined yields zero Lua values, so the
    // origin is the documented miss value; `agent.isMoving` is the real check.
    position: (id: unknown) => bridge()?.position(key(id)) ?? { x: 0, y: 0, z: 0 }
  };
}

export function buildRuntimeGlobals(node: LiveNode, deps: RuntimeApiDeps): Record<string, unknown> {
  const luaNode = createLuaNode(node, deps);
  const playerApi = deps.playerApi ?? createPlayerApi(deps);
  deps.playerApi = playerApi;
  return {
    script: {
      Name: 'Script',
      parent: luaNode,
      Parent: luaNode,
      onUpdate: luaNode.onUpdate,
      // `script.wait` is bound to `task.wait` by the Lua prelude, because the
      // yielding version has to live in Lua.
      Destroy: () => deps.world.destroy(node.id)
    },
    world: createWorldApi(deps),
    ui: createUiApi(deps),
    Instance: createInstanceApi(deps),
    network: createNetworkApi(deps),
    animation: createAnimationApi(deps),
    agent: createAgentApi(deps),
    player: playerApi,
    players: {
      getLocalPlayer: () => playerApi,
      GetPlayer: () => playerApi,
      LocalPlayer: playerApi
    },
    Vector3: {
      new: (x: unknown, y: unknown, z: unknown) => ({
        x: Number(x) || 0,
        y: Number(y) || 0,
        z: Number(z) || 0
      }),
      zero: { x: 0, y: 0, z: 0 },
      one: { x: 1, y: 1, z: 1 }
    },
    Color3: {
      new: (r: unknown, g: unknown, b: unknown) => ({
        r: Number(r) || 0,
        g: Number(g) || 0,
        b: Number(b) || 0
      }),
      fromRGB: (r: unknown, g: unknown, b: unknown) => ({
        r: (Number(r) || 0) / 255,
        g: (Number(g) || 0) / 255,
        b: (Number(b) || 0) / 255
      })
    },
    toVector: (value: unknown) => toVec3(value)
  };
}
