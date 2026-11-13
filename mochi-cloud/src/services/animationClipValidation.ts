// Server-side validation of creator animation clips.
//
// Mirrors engine/animation/clip.ts so a draft cannot store a clip the player
// would silently skip. Limits are duplicated rather than imported: mochi-cloud
// does not depend on mochi/src.

import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
  isValidEasePoints,
  validateVec3
} from './validationPrimitives';

export const MAX_ANIMATION_CLIPS = 64;
export const MAX_CLIP_TRACKS = 256;
export const MAX_TRACK_KEYFRAMES = 10000;
export const MAX_CLIP_DURATION = 3600;

function validateClip(candidate: unknown, index: number, errors: string[], ids: Set<string>): void {
  const label = `animations[${index}]`;
  if (!isRecord(candidate)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!isNonEmptyString(candidate.id)) {
    errors.push(`${label}.id is required`);
  } else if (ids.has(candidate.id)) {
    errors.push(`${label}.id is duplicated`);
  } else {
    ids.add(candidate.id);
  }
  if (!isNonEmptyString(candidate.name)) errors.push(`${label}.name is required`);
  if (!isFiniteNumber(candidate.duration) || candidate.duration <= 0 || candidate.duration > MAX_CLIP_DURATION) {
    errors.push(`${label}.duration must be between 0 and ${MAX_CLIP_DURATION} seconds`);
    return;
  }
  if (typeof candidate.loop !== 'boolean') errors.push(`${label}.loop must be a boolean`);

  if (!Array.isArray(candidate.tracks)) {
    errors.push(`${label}.tracks must be an array`);
    return;
  }
  if (candidate.tracks.length > MAX_CLIP_TRACKS) {
    errors.push(`${label}.tracks exceeds ${MAX_CLIP_TRACKS} entries`);
    return;
  }

  const duration = candidate.duration;
  const targets = new Set<string>();

  candidate.tracks.forEach((track, trackIndex) => {
    const trackLabel = `${label}.tracks[${trackIndex}]`;
    if (!isRecord(track)) {
      errors.push(`${trackLabel} must be an object`);
      return;
    }
    if (!isNonEmptyString(track.target)) {
      errors.push(`${trackLabel}.target is required`);
    } else if (targets.has(track.target)) {
      errors.push(`${trackLabel}.target is duplicated`);
    } else {
      targets.add(track.target);
    }
    if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) {
      errors.push(`${trackLabel}.keyframes must not be empty`);
      return;
    }
    if (track.keyframes.length > MAX_TRACK_KEYFRAMES) {
      errors.push(`${trackLabel}.keyframes exceeds ${MAX_TRACK_KEYFRAMES} entries`);
      return;
    }

    let previousTime = -Infinity;
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      const frameLabel = `${trackLabel}.keyframes[${keyframeIndex}]`;
      if (!isRecord(keyframe)) {
        errors.push(`${frameLabel} must be an object`);
        return;
      }
      if (!isFiniteNumber(keyframe.time) || keyframe.time < 0 || keyframe.time > duration) {
        errors.push(`${frameLabel}.time must be within [0, duration]`);
      } else if (keyframe.time <= previousTime) {
        errors.push(`${frameLabel}.time must be strictly increasing`);
      } else {
        previousTime = keyframe.time;
      }

      const channels = ['position', 'rotation', 'scale'] as const;
      const present = channels.filter((channel) => keyframe[channel] !== undefined);
      if (present.length === 0) {
        errors.push(`${frameLabel} must key at least one channel`);
      }
      for (const channel of present) {
        if (!validateVec3(keyframe[channel])) errors.push(`${frameLabel}.${channel} must be a finite vec3`);
      }
      if (keyframe.easing !== undefined && !['linear', 'step', 'bezier'].includes(String(keyframe.easing))) {
        errors.push(`${frameLabel}.easing must be linear, step or bezier`);
      }
      if (keyframe.ease !== undefined && !isValidEasePoints(keyframe.ease)) {
        errors.push(`${frameLabel}.ease must be four numbers with x controls in 0..1`);
      }
    });
  });
}

export function validateAnimationClips(candidate: unknown): string[] {
  const errors: string[] = [];
  if (candidate === undefined) return errors;
  if (!Array.isArray(candidate)) return ['animations must be an array'];
  if (candidate.length > MAX_ANIMATION_CLIPS) return [`animations exceeds ${MAX_ANIMATION_CLIPS} entries`];

  const ids = new Set<string>();
  candidate.forEach((clip, index) => validateClip(clip, index, errors, ids));
  return errors;
}
