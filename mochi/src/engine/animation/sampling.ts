// Keyframe sampling: evaluates a track's channels at an arbitrary time.
// Each channel (position/rotation/scale) interpolates independently between
// the keyframes that define it; step easing holds the left keyframe's value.

import type { AnimationKeyframe, AnimationTrack, AnimationVec3 } from './clip';

export interface SampledTransform {
  position?: AnimationVec3;
  rotation?: AnimationVec3;
  scale?: AnimationVec3;
}

type Channel = 'position' | 'rotation' | 'scale';

function lerpVec3(a: AnimationVec3, b: AnimationVec3, t: number): AnimationVec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

function sampleChannel(track: AnimationTrack, channel: Channel, time: number): AnimationVec3 | undefined {
  const keys = track.keyframes.filter((keyframe) => keyframe[channel] !== undefined);
  if (!keys.length) return undefined;
  if (time <= keys[0].time) return { ...keys[0][channel]! };
  const last = keys[keys.length - 1];
  if (time >= last.time) return { ...last[channel]! };

  let left = keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].time > time) break;
    left = keys[i];
  }
  const right = keys[keys.indexOf(left) + 1];
  const value = left[channel]!;
  if (left.easing === 'step') return { ...value };
  const span = right.time - left.time;
  const t = span > 0 ? (time - left.time) / span : 0;
  return lerpVec3(value, right[channel]!, t);
}

export function sampleTrack(track: AnimationTrack, time: number): SampledTransform {
  const result: SampledTransform = {};
  for (const channel of ['position', 'rotation', 'scale'] as const) {
    const value = sampleChannel(track, channel, time);
    if (value) result[channel] = value;
  }
  return result;
}

export function applySampledTransform(target: { position: AnimationVec3; rotation: AnimationVec3; scale: AnimationVec3 }, sample: SampledTransform): void {
  if (sample.position) Object.assign(target.position, sample.position);
  if (sample.rotation) Object.assign(target.rotation, sample.rotation);
  if (sample.scale) Object.assign(target.scale, sample.scale);
}

export function keyframeAt(track: AnimationTrack, time: number, tolerance = 1e-6): AnimationKeyframe | null {
  return track.keyframes.find((keyframe) => Math.abs(keyframe.time - time) <= tolerance) ?? null;
}

export function upsertKeyframe(track: AnimationTrack, keyframe: AnimationKeyframe): AnimationTrack {
  const keyframes = track.keyframes.filter((existing) => Math.abs(existing.time - keyframe.time) > 1e-6);
  keyframes.push(keyframe);
  keyframes.sort((a, b) => a.time - b.time);
  return { ...track, keyframes };
}

export function removeKeyframe(track: AnimationTrack, time: number, tolerance = 1e-6): AnimationTrack {
  return { ...track, keyframes: track.keyframes.filter((keyframe) => Math.abs(keyframe.time - time) > tolerance) };
}