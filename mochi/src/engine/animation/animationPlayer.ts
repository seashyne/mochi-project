// Plays Mochi animation clips through THREE.AnimationMixer. One mixer per
// root; clips bind to scene objects by id and to model bones by 'id/boneName'.

import * as THREE from 'three';
import type { MochiAnimationClip } from './clip';
import { toThreeClip, type TargetResolver } from './threeBridge';

export interface AnimationHandle {
  clipId: string;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (speed: number) => void;
  setTime: (time: number) => void;
  getTime: () => number;
  isRunning: () => boolean;
}

interface ActiveClip {
  action: THREE.AnimationAction;
  mixer: THREE.AnimationMixer;
  root: THREE.Object3D;
}

export class AnimationPlayer {
  private mixers = new Map<THREE.Object3D, THREE.AnimationMixer>();
  private active = new Map<string, ActiveClip>();

  play(root: THREE.Object3D, clip: MochiAnimationClip, resolve: TargetResolver): AnimationHandle | null {
    const threeClip = toThreeClip(clip, resolve);
    if (!threeClip.tracks.length) return null;
    this.stop(clip.id);
    let mixer = this.mixers.get(root);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(root);
      this.mixers.set(root, mixer);
    }
    const action = mixer.clipAction(threeClip);
    action.setLoop(clip.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !clip.loop;
    action.reset().play();
    this.active.set(clip.id, { action, mixer, root });

    return {
      clipId: clip.id,
      stop: () => this.stop(clip.id),
      pause: () => { action.paused = true; },
      resume: () => { action.paused = false; },
      setSpeed: (speed: number) => { action.timeScale = speed; },
      setTime: (time: number) => { action.time = time; mixer!.update(0); },
      getTime: () => action.time,
      isRunning: () => action.isRunning()
    };
  }

  update(dt: number): void {
    for (const mixer of this.mixers.values()) mixer.update(dt);
  }

  stop(clipId: string): void {
    const entry = this.active.get(clipId);
    if (!entry) return;
    entry.action.stop();
    entry.mixer.uncacheAction(entry.action.getClip());
    this.active.delete(clipId);
  }

  stopAll(): void {
    for (const clipId of [...this.active.keys()]) this.stop(clipId);
  }

  get activeCount(): number {
    return this.active.size;
  }

  dispose(): void {
    this.stopAll();
    for (const [root, mixer] of this.mixers) {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    this.mixers.clear();
  }
}

// Resolves clip targets against loaded meshes: 'objectId' for whole objects,
// 'objectId/boneName' for a named node inside a model subtree.
export function createMeshResolver(meshes: THREE.Object3D[]): TargetResolver {
  const byId = new Map<string, THREE.Object3D>();
  for (const mesh of meshes) {
    const id = (mesh.userData as { id?: string }).id;
    if (typeof id === 'string') byId.set(id, mesh);
  }
  return (target: string) => {
    const slash = target.indexOf('/');
    if (slash < 0) return byId.get(target) ?? null;
    const object = byId.get(target.slice(0, slash));
    if (!object) return null;
    return object.getObjectByName(target.slice(slash + 1)) ?? null;
  };
}