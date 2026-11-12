// Bridge between Mochi clips and THREE.AnimationClip so the engine mixer
// plays authored clips and imported GLTF animations become editable.

import * as THREE from 'three';
import type { AnimationKeyframe, AnimationTrack, MochiAnimationClip } from './clip';

export type TargetResolver = (target: string) => THREE.Object3D | null;

const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

export function toThreeClip(clip: MochiAnimationClip, resolve: TargetResolver): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const object = resolve(track.target);
    if (!object) continue;
    for (const channel of ['position', 'rotation', 'scale'] as const) {
      const keys = track.keyframes.filter((keyframe) => keyframe[channel] !== undefined);
      if (!keys.length) continue;
      const times = keys.map((keyframe) => keyframe.time);
      if (channel === 'rotation') {
        const values: number[] = [];
        for (const keyframe of keys) {
          const rotation = keyframe.rotation!;
          quaternion.setFromEuler(euler.set(rotation.x, rotation.y, rotation.z, 'XYZ'));
          values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${object.uuid}.quaternion`, times, values));
      } else {
        const values: number[] = [];
        for (const keyframe of keys) {
          const value = keyframe[channel]!;
          values.push(value.x, value.y, value.z);
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${object.uuid}.${channel}`, times, values));
      }
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