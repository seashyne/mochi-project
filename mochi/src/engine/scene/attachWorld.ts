// Attaches a game world (v1 inline or v2 chunked) to a scene and reports the
// spawn point. Chunked worlds resolve asynchronously and dispose safely when
// the player unmounts before download completes.

import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import { StudioObject, StudioVec3 } from '../studio/types';
import { loadWorldFromManifest } from './sceneLoader';
import { loadChunkedWorld, parseChunkedManifest, type ChunkedWorldLoadResult } from './chunkedWorldLoader';
import { SceneBinding } from './sceneBindings';
import { AdvancedFeatureRuntime } from '../studio/advancedRuntime';
import { AnimationPlayer, createMeshResolver } from '../animation/animationPlayer';
import { AnimationStateMachineRuntime } from '../animation/stateMachineRuntime';
import { readAnimationStateMachine } from '../animation/stateMachineManifest';
import type { AnimStateMachineDef } from '../animation/stateMachine';
import type { AnimationBridge } from '../runtime/luaNodeApi';
import { validateClip, type MochiAnimationClip } from '../animation/clip';
import type { MochiManifestV2 } from '../package/manifestV2';

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

export function attachWorld(
  scene: THREE.Scene,
  rawManifest: string | undefined,
  physicsWorld: PhysicsWorld
): WorldAttachment {
  const chunked = parseChunkedManifest(rawManifest);
  const clips = parseAnimationClips(rawManifest, chunked);
  const stateMachine = parseStateMachine(rawManifest, chunked);
  const player = new AnimationPlayer();
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
    return {
      ...animationControls,
      animationBridge,
      getObjects: () => result.objects,
      getBindings: () => result.bindings,
      ready: result.ready.then(() => result.spawnPoint),
      update: () => true,
      tick: (dt) => { features.update(dt); if (machine) machine.update(dt); else player.update(dt); },
      dispose: () => { machine?.dispose(); player.dispose(); features.dispose(); result.dispose(); }
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
          // Chunk residency changed: rebind clips to the resident meshes.
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
      loaded?.dispose();
    }
  };
}
