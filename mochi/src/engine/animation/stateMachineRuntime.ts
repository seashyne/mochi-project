// Runs an AnimStateMachine on top of THREE.AnimationMixer, with a real
// crossfade per transition. The state graph stays pure (see stateMachine.ts);
// this file only owns the mixer, the actions and the fade bookkeeping.

import * as THREE from 'three';
import type { MochiAnimationClip } from './clip';
import { toThreeClip, type TargetResolver } from './threeBridge';
import { AnimStateMachine, type AnimStateDef, type AnimStateMachineDef } from './stateMachine';

export class AnimationStateMachineRuntime {
  private readonly mixer: THREE.AnimationMixer;
  private readonly machine: AnimStateMachine;
  private readonly clips = new Map<string, MochiAnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly resolve: TargetResolver;
  private currentAction: THREE.AnimationAction | null = null;
  private currentClip: MochiAnimationClip | null = null;
  private disposed = false;

  constructor(
    root: THREE.Object3D,
    definition: AnimStateMachineDef,
    clips: MochiAnimationClip[],
    resolve: TargetResolver
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    this.machine = new AnimStateMachine(definition);
    this.resolve = resolve;
    for (const clip of clips) this.clips.set(clip.id, clip);
    this.enter(this.machine.currentStateDef, 0, 0);
  }

  get state(): string { return this.machine.currentState; }
  get stateMachine(): AnimStateMachine { return this.machine; }
  get clipId(): string | null { return this.currentClip?.id ?? null; }

  setBool(name: string, value: boolean): void { this.machine.setBool(name, value); }
  setNumber(name: string, value: number): void { this.machine.setNumber(name, value); }
  setTrigger(name: string): void { this.machine.setTrigger(name); }

  update(dt: number): void {
    if (this.disposed) return;
    this.mixer.update(dt);

    const event = this.machine.update(dt, this.progress());
    if (!event) return;

    const next = this.machine.currentStateDef;
    // A transition whose clip is missing leaves the machine pointing at a state
    // that cannot play. Keep the previous action running rather than blanking
    // the character, and let the next frame re-evaluate.
    this.enter(next, event.duration, event.offset);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.actions.clear();
    this.currentAction = null;
    this.currentClip = null;
  }

  private progress(): number {
    if (!this.currentAction || !this.currentClip || this.currentClip.duration <= 0) return 0;
    return this.currentAction.time / this.currentClip.duration;
  }

  private enter(state: AnimStateDef, duration: number, offset: number): void {
    const clip = this.clips.get(state.clipId);
    if (!clip) return;

    const action = this.ensureAction(clip);
    if (!action) return;

    action.setLoop(state.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = state.loop === false;
    action.timeScale = state.speed && state.speed > 0 ? state.speed : 1;
    action.reset();
    action.time = Math.min(Math.max(offset, 0), 1) * clip.duration;
    action.setEffectiveWeight(1);
    action.play();

    const previous = this.currentAction;
    if (previous && previous !== action) {
      if (duration > 0) previous.crossFadeTo(action, duration, false);
      else previous.stop();
    }

    this.currentAction = action;
    this.currentClip = clip;
  }

  private ensureAction(clip: MochiAnimationClip): THREE.AnimationAction | null {
    const existing = this.actions.get(clip.id);
    if (existing) return existing;

    const threeClip = toThreeClip(clip, this.resolve);
    if (!threeClip.tracks.length) return null;

    const action = this.mixer.clipAction(threeClip);
    this.actions.set(clip.id, action);
    return action;
  }
}
