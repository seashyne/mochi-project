// Mochi animation clip format: keyframed transform tracks targeting scene
// objects or model bones. Rotations are radians (engine convention); the
// editor UI converts to degrees for display.

import { isValidEase } from './bezier';

export interface AnimationVec3 {
  x: number;
  y: number;
  z: number;
}

export type AnimationEasing = 'linear' | 'step' | 'bezier';

export interface AnimationKeyframe {
  time: number;
  position?: AnimationVec3;
  rotation?: AnimationVec3;
  scale?: AnimationVec3;
  easing?: AnimationEasing;
  // Control points for `easing: 'bezier'`, in CSS order (x1, y1, x2, y2).
  // Missing or malformed values fall back to DEFAULT_EASE at sample time.
  ease?: import('./bezier').BezierPoints;
}

export interface AnimationTrack {
  target: string;
  keyframes: AnimationKeyframe[];
}

export interface MochiAnimationClip {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
}

export const MAX_CLIP_DURATION = 3600;
export const MAX_CLIP_TRACKS = 256;
export const MAX_TRACK_KEYFRAMES = 10000;

function isFiniteVec3(value: unknown): value is AnimationVec3 {
  if (!value || typeof value !== 'object') return false;
  const vec = value as Record<string, unknown>;
  return ['x', 'y', 'z'].every((axis) => typeof vec[axis] === 'number' && Number.isFinite(vec[axis]));
}

export function validateClip(clip: unknown): string[] {
  const errors: string[] = [];
  if (!clip || typeof clip !== 'object') return ['clip must be an object'];
  const candidate = clip as Partial<MochiAnimationClip>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) errors.push('clip.id is required');
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) errors.push('clip.name is required');
  if (typeof candidate.duration !== 'number' || !Number.isFinite(candidate.duration) || candidate.duration <= 0 || candidate.duration > MAX_CLIP_DURATION) {
    errors.push(`clip.duration must be a finite number in (0, ${MAX_CLIP_DURATION}]`);
  }
  if (typeof candidate.loop !== 'boolean') errors.push('clip.loop must be a boolean');
  if (!Array.isArray(candidate.tracks)) return [...errors, 'clip.tracks must be an array'];
  if (candidate.tracks.length > MAX_CLIP_TRACKS) errors.push(`clip.tracks exceeds ${MAX_CLIP_TRACKS} entries`);

  const duration = typeof candidate.duration === 'number' ? candidate.duration : Infinity;
  const seenTargets = new Set<string>();
  candidate.tracks.forEach((track, index) => {
    const label = `tracks[${index}]`;
    if (!track || typeof track !== 'object') { errors.push(`${label} must be an object`); return; }
    if (typeof track.target !== 'string' || !track.target.trim()) errors.push(`${label}.target is required`);
    else if (seenTargets.has(track.target)) errors.push(`${label}.target is duplicated`);
    else seenTargets.add(track.target);
    if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) {
      errors.push(`${label}.keyframes must be a non-empty array`);
      return;
    }
    if (track.keyframes.length > MAX_TRACK_KEYFRAMES) {
      errors.push(`${label}.keyframes exceeds ${MAX_TRACK_KEYFRAMES} entries`);
    }
    let previousTime = -Infinity;
    track.keyframes.forEach((keyframe, keyIndex) => {
      const keyLabel = `${label}.keyframes[${keyIndex}]`;
      if (!keyframe || typeof keyframe !== 'object') { errors.push(`${keyLabel} must be an object`); return; }
      if (typeof keyframe.time !== 'number' || !Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time > duration) {
        errors.push(`${keyLabel}.time must be within [0, duration]`);
      } else if (keyframe.time <= previousTime) {
        errors.push(`${keyLabel}.time must be strictly increasing`);
      } else {
        previousTime = keyframe.time;
      }
      for (const channel of ['position', 'rotation', 'scale'] as const) {
        if (keyframe[channel] !== undefined && !isFiniteVec3(keyframe[channel])) {
          errors.push(`${keyLabel}.${channel} must be a finite vec3`);
        }
      }
      if (keyframe.easing !== undefined && !['linear', 'step', 'bezier'].includes(keyframe.easing)) {
        errors.push(`${keyLabel}.easing must be linear, step or bezier`);
      }
      if (keyframe.ease !== undefined && !isValidEase(keyframe.ease)) {
        errors.push(`${keyLabel}.ease must be four numbers with x controls in 0..1`);
      }
      if (keyframe.position === undefined && keyframe.rotation === undefined && keyframe.scale === undefined) {
        errors.push(`${keyLabel} must key at least one channel`);
      }
    });
  });
  return errors;
}

export function normalizeClip(clip: MochiAnimationClip): MochiAnimationClip {
  return {
    ...clip,
    tracks: clip.tracks.map((track) => ({
      ...track,
      keyframes: [...track.keyframes].sort((a, b) => a.time - b.time)
    }))
  };
}

export function createEmptyClip(id: string, name: string, duration = 2): MochiAnimationClip {
  return { id, name, duration, loop: true, tracks: [] };
}