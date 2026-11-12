// Animation clip core: validation, sampling, keyframe ops, THREE bridge

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  validateClip, normalizeClip, createEmptyClip, sampleTrack, upsertKeyframe,
  removeKeyframe, keyframeAt, toThreeClip, fromThreeClip,
  type MochiAnimationClip, type AnimationTrack
} from '../src/engine/animation';

const clip = (overrides: Partial<MochiAnimationClip> = {}): MochiAnimationClip => ({
  id: 'c1', name: 'Wave', duration: 2, loop: true,
  tracks: [{
    target: 'arm',
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { time: 1, position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI / 2 } },
      { time: 2, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ]
  }],
  ...overrides
});

describe('clip validation', () => {
  it('accepts a well-formed clip', () => {
    expect(validateClip(clip())).toEqual([]);
  });

  it.each([
    [null, 'clip must be an object'],
    [{ ...clip(), id: '' }, 'clip.id is required'],
    [{ ...clip(), duration: 0 }, 'clip.duration'],
    [{ ...clip(), duration: 3601 }, 'clip.duration'],
    [{ ...clip(), loop: 'yes' }, 'clip.loop must be a boolean'],
    [{ ...clip(), tracks: 'x' }, 'clip.tracks must be an array']
  ])('rejects malformed clip %j', (value, message) => {
    expect(validateClip(value).join(' ')).toContain(message as string);
  });

  it('rejects bad tracks and keyframes', () => {
    expect(validateClip(clip({ tracks: [{ target: '', keyframes: [] }] })).join(' ')).toContain('target is required');
    const dup = clip();
    dup.tracks.push({ ...dup.tracks[0] });
    expect(validateClip(dup).join(' ')).toContain('duplicated');
    const unsorted = clip();
    unsorted.tracks[0].keyframes = [{ time: 1, scale: { x: 1, y: 1, z: 1 } }, { time: 0.5, scale: { x: 1, y: 1, z: 1 } }];
    expect(validateClip(unsorted).join(' ')).toContain('strictly increasing');
    const outOfRange = clip();
    outOfRange.tracks[0].keyframes[1].time = 3;
    expect(validateClip(outOfRange).join(' ')).toContain('within [0, duration]');
    const empty = clip();
    empty.tracks[0].keyframes = [{ time: 0 }];
    expect(validateClip(empty).join(' ')).toContain('at least one channel');
    const badVec = clip();
    badVec.tracks[0].keyframes[0].position = { x: NaN, y: 0, z: 0 };
    expect(validateClip(badVec).join(' ')).toContain('finite vec3');
    const badEase = clip();
    badEase.tracks[0].keyframes[0].easing = 'bounce' as never;
    expect(validateClip(badEase).join(' ')).toContain('easing');
  });
});

describe('track sampling', () => {
  const track = clip().tracks[0];

  it('interpolates linearly between keyframes', () => {
    const sample = sampleTrack(track, 0.5);
    expect(sample.position!.x).toBeCloseTo(5, 5);
    expect(sample.rotation!.z).toBeCloseTo(Math.PI / 4, 5);
  });

  it('clamps before the first and after the last keyframe', () => {
    expect(sampleTrack(track, -1).position).toEqual({ x: 0, y: 0, z: 0 });
    expect(sampleTrack(track, 5).position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('holds the left value with step easing', () => {
    const stepped: AnimationTrack = {
      target: 't',
      keyframes: [
        { time: 0, position: { x: 0, y: 0, z: 0 }, easing: 'step' },
        { time: 1, position: { x: 10, y: 0, z: 0 } }
      ]
    };
    expect(sampleTrack(stepped, 0.9).position!.x).toBe(0);
    expect(sampleTrack(stepped, 1).position!.x).toBe(10);
  });

  it('samples channels independently when keyframes differ', () => {
    const mixed: AnimationTrack = {
      target: 't',
      keyframes: [
        { time: 0, position: { x: 0, y: 0, z: 0 } },
        { time: 1, scale: { x: 2, y: 2, z: 2 } },
        { time: 2, position: { x: 4, y: 0, z: 0 } }
      ]
    };
    const sample = sampleTrack(mixed, 1);
    expect(sample.position!.x).toBeCloseTo(2, 5);
    expect(sample.scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(sample.rotation).toBeUndefined();
  });
});

describe('keyframe operations', () => {
  it('upserts, finds and removes keyframes keeping order', () => {
    let track = clip().tracks[0];
    track = upsertKeyframe(track, { time: 0.5, scale: { x: 1, y: 1, z: 1 } });
    expect(track.keyframes.map(k => k.time)).toEqual([0, 0.5, 1, 2]);
    track = upsertKeyframe(track, { time: 0.5, scale: { x: 3, y: 3, z: 3 } });
    expect(track.keyframes).toHaveLength(4);
    expect(keyframeAt(track, 0.5)!.scale!.x).toBe(3);
    track = removeKeyframe(track, 0.5);
    expect(keyframeAt(track, 0.5)).toBeNull();
    expect(normalizeClip(clip({ tracks: [{ target: 'x', keyframes: [{ time: 1, scale: { x: 1, y: 1, z: 1 } }, { time: 0, scale: { x: 1, y: 1, z: 1 } }] }] })).tracks[0].keyframes[0].time).toBe(0);
    expect(createEmptyClip('id', 'Name')).toMatchObject({ duration: 2, loop: true, tracks: [] });
  });
});

describe('THREE bridge', () => {
  it('plays through AnimationMixer matching sampled values', () => {
    const object = new THREE.Object3D();
    const root = new THREE.Group();
    root.add(object);
    const threeClip = toThreeClip(clip(), (target) => (target === 'arm' ? object : null));
    expect(threeClip.tracks).toHaveLength(2);
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(threeClip);
    action.play();
    mixer.setTime(0.5);
    expect(object.position.x).toBeCloseTo(5, 3);
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 4, 'XYZ'));
    expect(object.quaternion.angleTo(expected)).toBeLessThan(0.01);
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
  });

  it('skips unresolvable targets', () => {
    expect(toThreeClip(clip(), () => null).tracks).toHaveLength(0);
  });

  it('roundtrips position and scale through fromThreeClip', () => {
    const object = new THREE.Object3D();
    object.name = 'arm';
    const source = new THREE.AnimationClip('src', 2, [
      new THREE.VectorKeyframeTrack('arm.position', [0, 2], [0, 0, 0, 8, 0, 0]),
      new THREE.VectorKeyframeTrack('arm.scale', [0, 2], [1, 1, 1, 2, 2, 2])
    ]);
    const imported = fromThreeClip(source, { id: 'i1', name: 'Imported' }, (node) => (node === 'arm' ? 'arm' : null));
    expect(imported.tracks).toHaveLength(1);
    expect(imported.tracks[0].keyframes[1]).toMatchObject({ time: 2, position: { x: 8, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } });
    expect(validateClip(imported)).toEqual([]);
  });

  it('converts quaternion tracks to euler keyframes', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'));
    const source = new THREE.AnimationClip('rot', 1, [
      new THREE.QuaternionKeyframeTrack('bone.quaternion', [0, 1], [0, 0, 0, 1, q.x, q.y, q.z, q.w])
    ]);
    const imported = fromThreeClip(source, { id: 'i2', name: 'Rot' }, () => 'bone');
    expect(imported.tracks[0].keyframes[1].rotation!.y).toBeCloseTo(Math.PI / 2, 3);
  });
});