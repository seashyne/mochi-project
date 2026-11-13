// Attaches a game world (v1 inline or v2 chunked) to a scene and reports the
// spawn point. Chunked worlds resolve asynchronously and dispose safely when
// the player unmounts before download completes.

import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import { StudioObject, StudioVec3 } from '../studio/types';
import { loadWorldFromManifest } from './sceneLoader';
import { loadChunkedWorld, parseChunkedManifest, type ChunkedWorldLoadResult } from './chunkedWorldLoader';
import { SceneBinding } from './sceneBindings';
import { setOccludersFromPhysics } from './occlusionCulling';
import { AdvancedFeatureRuntime } from '../studio/advancedRuntime';
import { AnimationPlayer, createMeshResolver } from '../animation/animationPlayer';
import { AnimationStateMachineRuntime } from '../animation/stateMachineRuntime';
import { readAnimationStateMachine } from '../animation/stateMachineManifest';
import type { AnimStateMachineDef } from '../animation/stateMachine';
import type { AnimationBridge } from '../runtime/luaNodeApi';
import { validateClip, type MochiAnimationClip } from '../animation/clip';
import type { MochiManifestV2 } from '../package/manifestV2';
import { SceneEnvironment } from '../environment/SceneEnvironment';
import { normalizeEnvironmentState, STARTER_ENVIRONMENT } from '../environment/environmentTypes';
import { isValidSkyboxId } from '../environment/skyboxPresets';

export interface WorldAttachment {
  scriptCode?: string;
  immediateSpawn?: StudioVec3;
  /** Objects currently resident in the scene (chunked worlds grow/shrink over time). */
  getObjects: () => StudioObject[];
  /** Mesh/collider pairs already in the scene, so the runtime can adopt them. */
  getBindings: () => Map<string, SceneBinding>;
  ready: Promise<StudioVec3 | null>;
  update: (position: StudioVec3) => boolean;
  /** Drives constraint solvers and particle emitters on the fixed physics tick. */
  tick?: (dt: number) => void;
  /** Sets a bool/number parameter on the animation state graph, if the world has one. */
  setAnimationParameter?: (name: string, value: boolean | number) => void;
  /** Fires a one-shot trigger parameter on the animation state graph. */
  triggerAnimation?: (name: string) => void;
  /** Current animation state id, or null when the world has no state graph. */
  getAnimationState?: () => string | null;
  /** Same controls in the shape Lua's `animation.*` expects. */
  animationBridge: AnimationBridge;
  dispose: () => void;
}

const EMPTY_BINDINGS = new Map<string, SceneBinding>();

function parseAnimationClips(rawManifest: string | undefined, chunked: MochiManifestV2 | null): MochiAnimationClip[] {
  let candidate: unknown;
  if (chunked) candidate = chunked.animations;
  else {
    try { candidate = (JSON.parse(rawManifest ?? '') as { animations?: unknown }).animations; }
    catch { return []; }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((clip): clip is MochiAnimationClip => {
    const errors = validateClip(clip);
    if (errors.length) console.warn('Skipping invalid animation clip', errors);
    return errors.length === 0;
  });
}

function parseStateMachine(
  rawManifest: string | undefined,
  chunked: MochiManifestV2 | null
): AnimStateMachineDef | null {
  let candidate: unknown;
  if (chunked) candidate = chunked.animationStateMachine;
  else {
    try { candidate = (JSON.parse(rawManifest ?? '') as { animationStateMachine?: unknown }).animationStateMachine; }
    catch { return null; }
  }
  const { definition, errors } = readAnimationStateMachine(candidate);
  if (errors.length) console.warn('Ignoring invalid animation state machine', errors);
  return definition;
}

export interface AttachWorldOptions {
  /**
   * Enables image-based lighting. Without it the skybox, fog and sun still apply -
   * PMREM needs a renderer, but the creator's lighting choice does not.
   */
  renderer?: THREE.WebGLRenderer;
}

/**
 * The creator's environment, or the starter scene when the manifest has none.
 * Exported because it is the whole data path between publish and the renderer, and
 * the renderer-dependent half cannot be exercised headlessly.
 */
export function resolveWorldEnvironment(rawManifest: string | undefined, chunked: MochiManifestV2 | null) {
  if (chunked?.environment) {
    return normalizeEnvironmentState(chunked.environment, isValidSkyboxId);
  }
  try {
    const parsed = JSON.parse(rawManifest ?? '') as { environment?: unknown };
    return normalizeEnvironmentState(parsed.environment, isValidSkyboxId);
  } catch {
    return STARTER_ENVIRONMENT;
  }
}

export function attachWorld(
  scene: THREE.Scene,
  rawManifest: string | undefined,
  physicsWorld: PhysicsWorld,
  options: AttachWorldOptions = {}
): WorldAttachment {
  const chunked = parseChunkedManifest(rawManifest);
  const clips = parseAnimationClips(rawManifest, chunked);
  const stateMachine = parseStateMachine(rawManifest, chunked);
  const player = new AnimationPlayer();
  // Owned here rather than by the viewport: the world decides how it is lit, and the
  // environment has to come and go with the world. Only built when a renderer is
  // supplied - PMREM needs one, and a headless caller has nothing to light.
  const renderer = options.renderer;
  const environment = renderer ? new SceneEnvironment(scene) : null;
  if (environment && renderer) {
    void environment
      .apply(resolveWorldEnvironment(rawManifest, chunked), renderer, {
        onError: (error) => console.warn('Environment failed to load', error)
      })
      .catch(() => {});
  }
  let machine: AnimationStateMachineRuntime | null = null;

  // A state graph replaces blanket playback: clips are entered through
  // transitions instead of every clip starting at once.
  const startClips = (meshes: THREE.Object3D[]) => {
    const resolve = createMeshResolver(meshes);
    if (stateMachine) {
      machine?.dispose();
      machine = new AnimationStateMachineRuntime(scene, stateMachine, clips, resolve);
      return;
    }
    for (const clip of clips) player.play(scene, clip, resolve);
  };

  const animationControls = {
    setAnimationParameter: (name: string, value: boolean | number) => {
      if (typeof value === 'number') machine?.setNumber(name, value);
      else machine?.setBool(name, value);
    },
    triggerAnimation: (name: string) => machine?.setTrigger(name),
    getAnimationState: () => machine?.state ?? null
  };

  const animationBridge: AnimationBridge = {
    setParameter: animationControls.setAnimationParameter,
    trigger: animationControls.triggerAnimation,
    getState: animationControls.getAnimationState
  };

  if (!chunked) {
    const result = loadWorldFromManifest(scene, rawManifest, physicsWorld);
    const features = new AdvancedFeatureRuntime(scene, physicsWorld);
    features.mount(result.objects);
    startClips(result.meshes);
    // Solid static bodies are the occluders. Model colliders arrive with `ready`,
    // so the set is refreshed once they land.
    setOccludersFromPhysics(physicsWorld);
    void result.ready.then(() => setOccludersFromPhysics(physicsWorld)).catch(() => {});
    return {
      ...animationControls,
      animationBridge,
      getObjects: () => result.objects,
      getBindings: () => result.bindings,
      ready: result.ready.then(() => result.spawnPoint),
      update: () => true,
      tick: (dt) => { features.update(dt); if (machine) machine.update(dt); else player.update(dt); },
      dispose: () => {
        machine?.dispose();
        player.dispose();
        features.dispose();
        environment?.dispose();
        result.dispose();
      }
    };
  }

  const abort = new AbortController();
  const features = new AdvancedFeatureRuntime(scene, physicsWorld);
  let loaded: ChunkedWorldLoadResult | undefined;
  let mountedObjectCount = -1;
  let lastUpdate = -Infinity;
  let lastPosition: StudioVec3 = chunked.spawn ?? { x: 0, y: 1, z: 0 };

  const ready = loadChunkedWorld(scene, chunked, physicsWorld, { signal: abort.signal })
    .then((result) => {
      if (abort.signal.aborted) { result.dispose(); return null; }
      loaded = result;
      features.mount(result.objects);
      mountedObjectCount = result.objects.length;
      startClips(result.meshes);
      setOccludersFromPhysics(physicsWorld);
      return result.spawnPoint;
    });

  return {
    ...animationControls,
    animationBridge,
    scriptCode: chunked.scriptCode,
    immediateSpawn: chunked.spawn,
    getObjects: () => loaded?.objects ?? [],
    getBindings: () => loaded?.bindings ?? EMPTY_BINDINGS,
    ready,
    update: (position) => {
      if (!loaded || abort.signal.aborted) return false;
      const now = performance.now();
      if (now - lastUpdate >= 200 || Math.hypot(position.x - lastPosition.x, position.z - lastPosition.z) >= 4) {
        lastUpdate = now;
        lastPosition = { ...position };
        loaded.update(position);
        if (loaded.objects.length !== mountedObjectCount) {
          features.mount(loaded.objects);
          mountedObjectCount = loaded.objects.length;
          // Chunk residency changed: rebind clips to the resident meshes and
          // rebuild the occluder set from the new bodies.
          setOccludersFromPhysics(physicsWorld);
          if (clips.length) { player.stopAll(); startClips(loaded.meshes); }
        }
      }
      return loaded.isReadyAt(position);
    },
    tick: (dt) => { features.update(dt); if (machine) machine.update(dt); else player.update(dt); },
    dispose: () => {
      abort.abort();
      machine?.dispose();
      player.dispose();
      features.dispose();
      environment?.dispose();
      loaded?.dispose();
    }
  };
}
