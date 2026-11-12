// Sandboxed Environment Bridge connecting Lua scripts to Mochi runtime

import { LuaEngine } from 'wasmoon';
import {
  LuaPartProxy,
  LuaPlayerProxy,
  LuaWorldProxy,
  LuaUiProxy,
  LuaNetworkProxy,
  MochiScriptEnvironment
} from './types';
import { defaultReactLuaStore, injectReactLuaBridge } from './reactLuaBridge';

export function createDefaultPart(name: string = 'Part'): LuaPartProxy {
  const touchHandlers: Array<(player: LuaPlayerProxy) => void> = [];
  const part: LuaPartProxy = {
    name,
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    visible: true,
    rotateY: (deg: number) => {
      part.rotation.y = (part.rotation.y + deg) % 360;
    },
    setVisible: (visible: boolean) => {
      part.visible = Boolean(visible);
    },
    onTouch: (callback: (player: LuaPlayerProxy) => void) => {
      touchHandlers.push(callback);
    },
    triggerTouch: (player: LuaPlayerProxy) => {
      for (const handler of touchHandlers) {
        try {
          handler(player);
        } catch (err) {
          console.error('Error in onTouch handler:', err);
        }
      }
    }
  };
  return part;
}

export function createDefaultPlayer(): LuaPlayerProxy {
  return {
    id: 'player_local',
    username: 'Creator',
    health: 100,
    maxHealth: 100,
    position: { x: 0, y: 1, z: 5 },
    addScore: (_category: string, _amount: number) => {},
    setVelocity: (_x: number, _y: number, _z: number) => {},
    applyImpulse: (_x: number, _y: number, _z: number) => {},
    respawn: () => {}
  };
}

export function injectMochiLuaSandbox(
  lua: LuaEngine,
  env: MochiScriptEnvironment,
  customPart?: LuaPartProxy,
  onFireServer?: (event: string, data?: unknown) => void
): void {
  const activePart = customPart || createDefaultPart('Coin');
  const defaultPlayer = createDefaultPlayer();

  // Redirect Lua print()
  lua.global.set('print', (...args: unknown[]) => {
    const formatted = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    env.logs.push({ level: 'info', message: formatted, timestamp: Date.now() });
  });

  // Redirect Lua warn()
  lua.global.set('warn', (...args: unknown[]) => {
    const formatted = args.map((arg) => String(arg)).join(' ');
    env.logs.push({ level: 'warn', message: formatted, timestamp: Date.now() });
  });

  // Universal task.wait helper
  lua.global.set('task', {
    wait: (seconds: number, callback?: () => void) => {
      if (typeof callback === 'function') {
        setTimeout(callback, Math.max(0, seconds * 1000));
      }
    }
  });

  // Vector3 constructor
  lua.global.set('Vector3', {
    new: (x: number = 0, y: number = 0, z: number = 0) => ({ x, y, z })
  });

  // Standard game script object
  lua.global.set('script', {
    parent: activePart,
    Parent: activePart,
    onUpdate: {
      Connect: (callback: (dt: number) => void) => {
        env.updateListeners.push(callback);
      }
    },
    wait: (seconds: number, callback?: () => void) => {
      if (typeof callback === 'function') {
        setTimeout(callback, Math.max(0, seconds * 1000));
      }
    }
  });

  // World proxy
  const worldProxy: LuaWorldProxy = {
    playSound: (soundName: string, _position) => {
      env.logs.push({
        level: 'info',
        message: `[Sound] Playing audio effect: ${soundName}`,
        timestamp: Date.now()
      });
    },
    createPart: (options) => {
      const part = createDefaultPart(options.name || 'NewPart');
      return Object.assign(part, options);
    },
    findPart: (name: string) => {
      return name === activePart.name ? activePart : undefined;
    },
    setGravity: (_x, _y, _z) => {}
  };
  lua.global.set('world', worldProxy);

  // UI proxy
  const uiProxy: LuaUiProxy = {
    showNotification: (message: string) => {
      env.logs.push({
        level: 'info',
        message: `[UI Notification] ${message}`,
        timestamp: Date.now()
      });
    },
    setLeaderboard: (category: string, score: number) => {
      env.logs.push({
        level: 'info',
        message: `[Leaderboard] ${category}: ${score}`,
        timestamp: Date.now()
      });
    },
    showDialogue: (options) => defaultReactLuaStore.showDialogue(options),
    hideDialogue: () => defaultReactLuaStore.hideDialogue(),
    setHud: (id, element) => defaultReactLuaStore.setHud(id, element),
    removeHud: (id) => defaultReactLuaStore.removeHud(id)
  };
  lua.global.set('ui', uiProxy);

  // Players proxy
  lua.global.set('players', {
    getLocalPlayer: () => defaultPlayer,
    LocalPlayer: defaultPlayer
  });

  // Network proxy for Client-Server RPC and replication
  const networkProxy: LuaNetworkProxy = {
    FireServer: (eventName: string, data?: unknown) => {
      env.networkOutgoing.push({ event: eventName, data });
      if (onFireServer) {
        onFireServer(eventName, data);
      }
    },
    OnClientEvent: (eventName: string, callback: (data: unknown) => void) => {
      let list = env.networkHandlers.get(eventName);
      if (!list) {
        list = [];
        env.networkHandlers.set(eventName, list);
      }
      list.push(callback);
    },
    getState: (key: string) => env.replicatedState.get(key)
  };
  lua.global.set('network', networkProxy);

  // Inject React-Lua & Story helpers
  injectReactLuaBridge(lua, env, defaultReactLuaStore);
}
