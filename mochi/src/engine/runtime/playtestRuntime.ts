// Orchestrates one playtest session: scene, physics, player, live world, Lua contexts
// and the fixed-order tick that keeps all of them in sync.

import { defaultReactLuaStore } from '../lua/reactLuaBridge';
import { PhysicsWorld, RigidBody, TriggerEvent } from '../physics';
import { StudioObject } from '../studio/types';
import { AudioBus } from './audioBus';
import { GameState } from './gameState';
import { RuntimeApiDeps, createPlayerApi } from './luaNodeApi';
import { createRuntimeNavigation } from './runtimeNavigation';
import { createRuntimeAgents, type RuntimeAgents } from './runtimeAgents';
import { RuntimeWorld } from './objectRegistry';
import { PLAYER_BODY_ID, PlaytestPlayer } from './playtestPlayer';
import { createPlaytestScene, PlaytestSceneBundle } from './playtestScene';
import { ScriptContext } from './scriptContext';
import { SessionConsole, parseLuaErrorLine } from './sessionConsole';
import { handlePlayerTrigger } from './touchRules';
import { DEFAULT_PLAYER_SPAWN, RuntimeLogSink, RuntimeVec3 } from './types';
import { AdvancedFeatureRuntime } from '../studio/advancedRuntime';

export interface PlaytestRuntimeOptions {
  canvas: HTMLCanvasElement;
  objects: StudioObject[];
  title?: string;
  onLog?: RuntimeLogSink;
}

const FLOOR_ID = 'runtime_floor';

export class PlaytestRuntime {
  readonly state = new GameState();
  readonly consoleSession = new SessionConsole();
  private readonly audio = new AudioBus();
  private readonly physics = new PhysicsWorld();
  private readonly options: PlaytestRuntimeOptions;
  private readonly contexts: ScriptContext[] = [];
  private bundle: PlaytestSceneBundle | null = null;
  private world: RuntimeWorld | null = null;
  private player: PlaytestPlayer | null = null;
  private detachControls: (() => void) | null = null;
  private detachTriggers: (() => void) | null = null;
  private frame = 0;
  private lastTime = 0;
  private simTime = 0;
  private running = false;
  private spawnPoint: RuntimeVec3 = { ...DEFAULT_PLAYER_SPAWN };
  private deps: RuntimeApiDeps | null = null;
  private features: AdvancedFeatureRuntime | null = null;
  private navigation: ReturnType<typeof createRuntimeNavigation> | null = null;
  private agents: RuntimeAgents | null = null;

  /** One funnel for the terminal and any host sink. */
  private readonly logSink: RuntimeLogSink = (level, message, source, meta) => {
    this.consoleSession.push(level, message, source, meta);
    this.options.onLog?.(level, message, source, meta);
  };

  constructor(options: PlaytestRuntimeOptions) {
    this.options = options;
    this.consoleSession.setCommandHandler((code) => this.executeCode(code));
  }

  /** Executes ad-hoc Lua in the running playtest session. */
  async executeCode(code: string): Promise<void> {
    const trimmed = code?.trim();
    const world = this.world;
    const deps = this.deps;
    if (!trimmed || !world || !deps || !this.running) return;
    const id = 'live_Command';
    let node = world.get(id);
    if (!node) {
      node = world.adopt({
        id, name: 'Command', type: 'model',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }, color: '#94a3b8', luaScript: trimmed
      }, null, null);
      node.dynamic = true;
    }
    node.def.luaScript = trimmed;
    this.consoleSession.registerScript('Command', trimmed);
    this.contexts.filter((ctx) => ctx.node.id === id).forEach((ctx) => ctx.dispose());
    const context = new ScriptContext({ node, code: trimmed, deps });
    this.contexts.push(context);
    await context.start();
  }

  async start(): Promise<void> {
    if (this.running) return;
    const { canvas, objects } = this.options;

    defaultReactLuaStore.getHudElements().forEach((element) => defaultReactLuaStore.removeHud(element.id));
    defaultReactLuaStore.hideDialogue();
    this.state.reset();

    const bundle = createPlaytestScene(canvas);
    this.bundle = bundle;
    const world = new RuntimeWorld(bundle.scene, this.physics, (node, error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logSink('error', `Runtime error: ${message}`, node.name, {
        code: node.def.luaScript,
        line: parseLuaErrorLine(message)
      });
    });
    this.world = world;

    this.physics.addBody(
      new RigidBody({
        id: FLOOR_ID,
        type: 'static',
        position: { x: 0, y: -0.5, z: 0 },
        shape: { type: 'box', halfExtents: { x: 45, y: 0.5, z: 45 } }
      })
    );

    const spawnObject = objects.find((obj) => obj.type === 'spawn');
    this.spawnPoint = spawnObject ? { ...spawnObject.position } : { ...DEFAULT_PLAYER_SPAWN };
    objects.forEach((obj) => world.spawn(obj));
    world.relinkParents();
    this.features = new AdvancedFeatureRuntime(bundle.scene, this.physics);
    this.features.mount(objects);

    const player = new PlaytestPlayer(this.physics, bundle.scene, this.spawnPoint);
    this.player = player;
    bundle.followCamera.setTarget(player.getPosition());
    bundle.followCamera.teleportToTarget();
    this.detachControls = bundle.attachControls();
    this.detachTriggers = this.physics.onTrigger(this.handleTrigger);

    const navigation = createRuntimeNavigation(player, { agentRadius: 0.2 });
    navigation.setObjects(objects);
    this.navigation = navigation;
    this.agents = createRuntimeAgents(
      (key) => world.get(key) ?? world.findByName(key) ?? null,
      () => navigation.grid()
    );
    this.agents.setObjects(objects);
    const deps: RuntimeApiDeps = {
      world,
      player,
      audio: this.audio,
      state: this.state,
      log: this.logSink,
      setSpawnPoint: (position: RuntimeVec3) => player.setSpawnPoint(position),
      getSpawnPoint: () => player.getSpawnPoint(),
      getTime: () => this.simTime,
      navigation,
      agents: this.agents
    };
    // One shared proxy: `script.parent.onTouch` and `players.LocalPlayer` must agree.
    deps.playerApi = createPlayerApi(deps);
    this.deps = deps;

    const scripted = world.getAll().filter((node) => Boolean(node.def.luaScript?.trim()));
    scripted.forEach((node) => {
      this.consoleSession.registerScript(node.name, node.def.luaScript!.trim());
      this.contexts.push(
        new ScriptContext({ node, code: node.def.luaScript!.trim(), deps })
      );
    });
    await Promise.all(this.contexts.map((context) => context.start()));

    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
    this.logSink('info', `Session live — ${world.count()} objects, ${this.contexts.length} scripts`, 'runtime');
  }

  /** Rebuilds the session from scratch, keeping the same HUD/state subscriptions. */
  async restart(): Promise<void> {
    this.teardown();
    await this.start();
  }

  toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    return next;
  }

  dispose(): void {
    this.teardown();
    this.consoleSession.clearCommandHandler();
    this.audio.dispose();
    this.state.dispose();
    this.consoleSession.dispose();
  }

  private teardown(): void {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.detachTriggers?.();
    this.detachTriggers = null;
    this.detachControls?.();
    this.detachControls = null;
    this.contexts.forEach((context) => context.dispose());
    this.contexts.length = 0;
    this.navigation?.stop();
    this.agents?.stopAll();
    this.navigation = null;
    this.agents = null;
    this.player?.dispose();
    this.player = null;
    this.features?.dispose();
    this.features = null;
    this.world?.clear();
    this.world = null;
    this.physics.clear();
    this.bundle?.dispose();
    this.bundle = null;
    this.deps = null;
    this.simTime = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    const world = this.world;
    const player = this.player;
    const bundle = this.bundle;
    if (!world || !player || !bundle) return;

    const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
    this.lastTime = now;
    this.simTime += dt;

    world.applyAuthoritativeTransforms();
    this.physics.step(dt);
    world.syncFromPhysics();
    // Scripted walks (player and NPCs) advance here, before node updates, so a
    // script reading `player.position` this tick sees the moved position.
    this.navigation?.update(dt);
    this.agents?.update(dt);
    this.features?.update(dt);

    for (const node of world.getAll()) {
      node.dispatchUpdate(dt);
      if (node.def.type === 'coin' && node.visible) node.def.rotation.y += dt * 2.2;
    }

    player.update(dt, bundle.followCamera.getYaw());
    const position = player.getPosition();
    bundle.followCamera.setTarget(position);
    this.audio.setListener(position);
    bundle.followCamera.update(bundle.camera, dt);
    bundle.renderer.render(bundle.scene, bundle.camera);
  };

  private handleTrigger = (event: TriggerEvent): void => {
    const world = this.world;
    const player = this.player;
    const playerApi = this.deps?.playerApi;
    if (!world || !player || !playerApi) return;

    handlePlayerTrigger(event, PLAYER_BODY_ID, {
      world,
      physics: this.physics,
      player,
      playerApi,
      state: this.state,
      audio: this.audio,
      onJumpPad: () => player.controller.applyJumpPadImpulse(18)
    });
  };
}
