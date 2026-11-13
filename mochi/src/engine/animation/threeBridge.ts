// Bridge between Mochi clips and THREE.AnimationClip so the engine mixer
// plays authored clips and imported GLTF animations become editable.

import * as THREE from 'three';
import type { AnimationKeyframe, AnimationTrack, AnimationVec3, MochiAnimationClip } from './clip';
import { cubicBezierEase, DEFAULT_EASE } from './bezier';

export type TargetResolver = (target: string) => THREE.Object3D | null;

const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

// Step and bezier easing cannot be expressed by three's keyframe interpolants,
// so those segments are expanded into extra linear keys at import time. The
// runtime then plays exactly what the Studio sampler shows.
const STEP_HOLD_EPSILON = 1e-4;
const MAX_BEZIER_SAMPLES = 32;

interface ExpandedKey {
  time: number;
  value: AnimationVec3;
}

function lerpVec3(from: AnimationVec3, to: AnimationVec3, t: number): AnimationVec3 {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t
  };
}

// ~25 keys per second of bezier keeps the curve visually smooth without
// exploding the track size.
function bezierSampleCount(span: number): number {
  return Math.min(MAX_BEZIER_SAMPLES, Math.max(2, Math.ceil(span / 0.04)));
}

function expandChannelKeys(
  keys: AnimationKeyframe[],
  channel: 'position' | 'rotation' | 'scale'
): ExpandedKey[] {
  const expanded: ExpandedKey[] = [];

  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    const from = left[channel]!;
    const to = right[channel]!;
    const span = right.time - left.time;

    expanded.push({ time: left.time, value: from });
    if (span <= 0) continue;

    if (left.easing === 'step') {
      const holdUntil = right.time - STEP_HOLD_EPSILON;
      if (holdUntil > left.time) expanded.push({ time: holdUntil, value: from });
      continue;
    }

    if (left.easing === 'bezier') {
      const points = left.ease ?? DEFAULT_EASE;
      const count = bezierSampleCount(span);
      for (let step = 1; step < count; step += 1) {
        const linear = step / count;
        const eased = cubicBezierEase(points, linear);
        expanded.push({ time: left.time + span * linear, value: lerpVec3(from, to, eased) });
      }
    }
  }

  const last = keys[keys.length - 1];
  expanded.push({ time: last.time, value: last[channel]! });
  return expanded;
}

export function toThreeClip(clip: MochiAnimationClip, resolve: TargetResolver): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const object = resolve(track.target);
    if (!object) continue;
    for (const channel of ['position', 'rotation', 'scale'] as const) {
      const keys = track.keyframes.filter((keyframe) => keyframe[channel] !== undefined);
      if (!keys.length) continue;
      const expanded = expandChannelKeys(keys, channel);
      const times = expanded.map((key) => key.time);
      const values: number[] = [];
      for (const key of expanded) {
        if (channel === 'rotation') {
          const rotation = key.value;
          quaternion.setFromEuler(euler.set(rotation.x, rotation.y, rotation.z, 'XYZ'));
          values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        } else {
          values.push(key.value.x, key.value.y, key.value.z);
        }
      }
      tracks.push(channel === 'rotation'
        ? new THREE.QuaternionKeyframeTrack(`${object.uuid}.quaternion`, times, values)
        : new THREE.VectorKeyframeTrack(`${object.uuid}.${channel}`, times, values));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export interface ImportedClipInfo {
  id: string;
  name: string;
  loop?: boolean;
}

// Converts a THREE clip (e.g. from GLTF) back into the editable Mochi format.
// nodeNameFor maps bound node names to Mochi targets; unmapped nodes are skipped.
export function fromThreeClip(
  source: THREE.AnimationClip,
  info: ImportedClipInfo,
  nodeNameFor: (nodeName: string) => string | null
): MochiAnimationClip {
  const byTarget = new Map<string, Map<number, AnimationKeyframe>>();
  for (const track of source.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const target = parsed.nodeName ? nodeNameFor(parsed.nodeName) : null;
    if (!target) continue;
    const property = parsed.propertyName;
    if (property !== 'position' && property !== 'quaternion' && property !== 'scale') continue;
    let keys = byTarget.get(target);
    if (!keys) { keys = new Map(); byTarget.set(target, keys); }
    for (let i = 0; i < track.times.length; i++) {
      const time = track.times[i];
      let keyframe = keys.get(time);
      if (!keyframe) { keyframe = { time }; keys.set(time, keyframe); }
      const offset = i * (property === 'quaternion' ? 4 : 3);
      if (property === 'quaternion') {
        quaternion.set(track.values[offset], track.values[offset + 1], track.values[offset + 2], track.values[offset + 3]);
        euler.setFromQuaternion(quaternion, 'XYZ');
        keyframe.rotation = { x: euler.x, y: euler.y, z: euler.z };
      } else {
        keyframe[property] = {
          x: track.values[offset], y: track.values[offset + 1], z: track.values[offset + 2]
        };
      }
    }
  }
  const tracks: AnimationTrack[] = [...byTarget.entries()].map(([target, keys]) => ({
    target,
    keyframes: [...keys.values()].sort((a, b) => a.time - b.time)
  }));
  return {
    id: info.id,
    name: info.name,
    duration: source.duration > 0 ? source.duration : 1,
    loop: info.loop ?? true,
    tracks
  };
}