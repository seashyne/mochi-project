// Shared session core for a running game: adopts the world that is already in the
// scene, runs per-object Lua scripts, dispatches touch triggers and owns HUD/audio.

import * as THREE from 'three';
import { PhysicsWorld, TriggerEvent } from '../physics';
import { SceneBinding } from '../scene/sceneBindings';
import { StudioObject } from '../studio/types';
import { AudioBus } from './audioBus';
import { GameState } from './gameState';
import { RuntimeApiDeps, createPlayerApi, type AnimationBridge } from './luaNodeApi';
import { createRuntimeNavigation, type RuntimeNavigation } from './runtimeNavigation';
import { LiveNode } from './liveNode';
import { RuntimeWorld } from './objectRegistry';
import { ScriptContext } from './scriptContext';
import { SessionConsole, parseLuaErrorLine } from './sessionConsole';
import { handlePlayerTrigger, TouchContext } from './touchRules';
import { RuntimeLogSink, RuntimeNetworkAdapter, RuntimePlayerHandle, RuntimeVec3, WorldOp } from './types';

/** Drops the script body so a peer never re-runs it (and never re-broadcasts). */
function serializeNode(def: StudioObject): StudioObject {
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    position: { ...def.position },
    rotation: { ...def.rotation },
    scale: { ...def.scale },
    color: def.color,
    material: def.material,
    anchored: def.anchored,
    canCollide: def.canCollide,
    parentId: def.parentId ?? null
  };
}

export interface GameRuntimeOptions {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  player: RuntimePlayerHandle;
  /** Physics body id of the local player, used to filter trigger events. */
  playerBodyId: string;
  log?: RuntimeLogSink;
  /** Shared terminal store; when supplied the host owns its lifecycle. */
  consoleSession?: SessionConsole;
  spawnPoint?: RuntimeVec3;
  network?: RuntimeNetworkAdapter;
}

export class GameRuntime {
  readonly state = new GameState();
  readonly audio = new AudioBus();
  readonly consoleSession: SessionConsole;
  private readonly ownsConsole: boolean;
  readonly world: RuntimeWorld;

  private readonly options: GameRuntimeOptions;
  private readonly contexts = new Map<string, ScriptContext>();
  private readonly pendingScripts = new Set<Promise<void>>();
  private readonly deps: RuntimeApiDeps;
  private readonly navigation: RuntimeNavigation;
  private readonly touch: TouchContext;
  private readonly detachTrigger: (() => void) | null;
  private detachWorldOps: (() => void) | null = null;
  private applyingRemote = false;
  private spawnPoint: RuntimeVec3;
  private elapsed = 0;
  private disposed = false;

  /** Single funnel: every runtime message reaches the terminal and any host sink. */
  private readonly logSink: RuntimeLogSink = (level, message, source, meta) => {
    this.consoleSession.push(level, message, source, meta);
    this.options.log?.(level, message, source, meta);
  };

  constructor(options: GameRuntimeOptions) {
    this.options = options;
    // Before deps: the player API hands `player.moveTo` straight to this.
    this.navigation = createRuntimeNavigation(options.player);
    this.consoleSession = options.consoleSession ?? new SessionConsole();
    this.ownsConsole = !options.consoleSession;
    this.spawnPoint = options.spawnPoint ?? { x: 0, y: 2, z: 0 };
    this.world = new RuntimeWorld(
      options.scene,
      options.physics,
      (node, error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logSink('error', `Runtime error: ${message}`, node.name, {
          code: node.def.luaScript,
          line: parseLuaErrorLine(message)
        });
      },
      {
        onNodeCreated: (node) => this.broadcastSpawn(node),
        onNodeDestroyed: (node) => this.broadcastDestroy(node)
      }
    );
    this.deps = {
      world: this.world,
      player: options.player,
      audio: this.audio,
      state: this.state,
      log: this.logSink,
      setSpawnPoint: (position) => {
        this.spawnPoint = position;
      },
      getSpawnPoint: () => this.spawnPoint,
      getTime: () => this.elapsed,
      network: options.network,
      navigation: this.navigation
    };
    this.deps.playerApi = createPlayerApi(this.deps);
    this.touch = {
      world: this.world,
      physics: options.physics,
      player: options.player,
      playerApi: this.deps.playerApi,
      state: this.state,
      audio: this.audio
    };
    this.detachTrigger = options.physics.onTrigger(this.handleTrigger);
    this.detachWorldOps = options.network?.onWorldOp?.((op) => this.applyWorldOp(op)) ?? null;
    this.consoleSession.setCommandHandler((code) => this.executeCode(code));
  }

  /**
   * Routes `animation.*` Lua calls to the scene state graph. Called after the
   * world attaches, because the graph only exists once the manifest is parsed.
   * Passing null detaches (world unload).
   */
  setAnimationBridge(bridge: AnimationBridge | null): void {
    this.deps.animation = bridge ?? undefined;
  }

  /** Adopts newly resident objects and drops ones that left the world. */
  sync(objects: StudioObject[], bindings: Map<string, SceneBinding>): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    for (const def of objects) {
      seen.add(def.id);
      if (this.world.get(def.id)) continue;
      const binding = bindings.get(def.id);
      const node = this.world.adopt(def, binding?.mesh ?? null, binding?.body ?? null);
      if (def.luaScript?.trim()) void this.startScript(node);
    }
    this.navigation.setObjects(objects);
    for (const node of this.world.getAll()) {
      if (node.dynamic || seen.has(node.id)) continue;
      this.disposeContext(node.id);
      this.world.destroy(node.id);
    }
  }

  /** Spawns editor objects into this session without running their scripts. */
  seedObjects(objects: StudioObject[]): void {
    if (this.disposed) return;
    for (const def of objects) {
      if (!this.world.get(def.id)) this.world.spawn(def);
    }
    this.world.relinkParents();
  }

  /** Executes ad-hoc Lua in the live session (terminal command bar). */
  async executeCode(code: string, source = 'Command'): Promise<void> {
    const trimmed = code?.trim();
    if (!trimmed || this.disposed) return;
    const id = `live_${source.replace(/\W/g, '') || 'command'}`;
    let node = this.world.get(id);
    if (!node) {
      node = this.world.adopt({
        id, name: source, type: 'model',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }, color: '#94a3b8', luaScript: trimmed
      }, null, null);
      node.dynamic = true;
    }
    node.def.luaScript = trimmed;
    this.disposeContext(id);
    this.consoleSession.registerScript(source, trimmed);
    await this.startScript(node);
  }

  /** Runs the world-level manifest script against a synthetic node. */
  runWorldScript(code: string, name = 'World'): void {
    if (!code.trim() || this.world.get('world_script')) return;
    const node = this.world.adopt(
      {
        id: 'world_script',
        name,
        type: 'model',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#94a3b8',
        luaScript: code
      },
      null,
      null
    );
    node.dynamic = true;
    void this.startScript(node);
  }

  /** Pushes script-authored transforms into the scene before the host steps physics. */
  prePhysics(): void {
    if (!this.disposed) this.world.applyAuthoritativeTransforms();
  }

  /** Dispatches onUpdate handlers and coin spin after the host stepped physics. */
  update(dt: number): void {
    if (this.disposed) return;
    this.elapsed += dt;
    this.navigation.update(dt);
    for (const node of this.world.getAll()) {
      node.dispatchUpdate(dt);
      if (node.def.type === 'coin' && node.visible) node.def.rotation.y += dt * 2.2;
    }
  }

  toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    return next;
  }

  dispose(): void {
    this.disposed = true;
    this.consoleSession.clearCommandHandler();
    this.detachTrigger?.();
    this.navigation.stop();
    this.detachWorldOps?.();
    this.contexts.forEach((context) => context.dispose());
    this.contexts.clear();
    this.world.clear();
    this.audio.dispose();
    this.state.dispose();
    if (this.ownsConsole) this.consoleSession.dispose();
  }

  private broadcastSpawn(node: LiveNode): void {
    if (this.applyingRemote || !node.dynamic || node.remote) return;
    this.options.network?.sendWorldOp?.({ kind: 'spawn', object: serializeNode(node.def) });
  }

  private broadcastDestroy(node: LiveNode): void {
    if (this.applyingRemote || !node.dynamic || node.remote) return;
    this.options.network?.sendWorldOp?.({ kind: 'destroy', id: node.id });
  }

  /** Replays a peer's world edit without echoing it back. */
  private applyWorldOp = (op: WorldOp): void => {
    if (this.disposed) return;
    this.applyingRemote = true;
    try {
      if (op.kind === 'spawn' && op.object) {
        if (this.world.get(op.object.id)) return;
        const node = this.world.spawn({ ...op.object, luaScript: undefined }, { dynamic: true });
        node.remote = true;
        return;
      }
      if (op.kind === 'destroy' && op.id) {
        this.disposeContext(op.id);
        this.world.destroy(op.id);
      }
    } finally {
      this.applyingRemote = false;
    }
  };

  /** Resolves once every started script has finished loading and run. */
  async whenIdle(): Promise<void> {
    while (this.pendingScripts.size > 0) {
      await Promise.all(Array.from(this.pendingScripts));
    }
  }

  private startScript(node: LiveNode): Promise<void> {
    const code = node.def.luaScript?.trim();
    if (!code) return Promise.resolve();
    this.consoleSession.registerScript(node.name, code);
    const context = new ScriptContext({ node, code, deps: this.deps });
    this.contexts.set(node.id, context);
    const pending = context.start().finally(() => {
      this.pendingScripts.delete(pending);
    });
    this.pendingScripts.add(pending);
    return pending;
  }

  private disposeContext(nodeId: string): void {
    this.contexts.get(nodeId)?.dispose();
    this.contexts.delete(nodeId);
  }

  private handleTrigger = (event: TriggerEvent): void => {
    handlePlayerTrigger(event, this.options.playerBodyId, this.touch);
  };
}
