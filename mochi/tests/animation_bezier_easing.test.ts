// Cubic bezier easing: the solver, the clip format, the Studio sampler and the
// three.js expansion that makes the runtime match what the editor shows.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cubicBezierEase, DEFAULT_EASE, isValidEase } from '../src/engine/animation/bezier';
import { validateClip, type MochiAnimationClip } from '../src/engine/animation/clip';
import { sampleTrack } from '../src/engine/animation/sampling';
import { toThreeClip } from '../src/engine/animation/threeBridge';

const LINEARISH: [number, number, number, number] = [0, 0, 1, 1];

function clipWith(easing: 'linear' | 'step' | 'bezier', ease?: [number, number, number, number]): MochiAnimationClip {
  return {
    id: 'c',
    name: 'C',
    duration: 1,
    loop: false,
    tracks: [{
      target: 'box',
      keyframes: [
        { time: 0, position: { x: 0, y: 0, z: 0 }, easing, ease },
        { time: 1, position: { x: 10, y: 0, z: 0 } }
      ]
    }]
  };
}

describe('cubicBezierEase', () => {
  it('pins the endpoints', () => {
    expect(cubicBezierEase(DEFAULT_EASE, 0)).toBe(0);
    expect(cubicBezierEase(DEFAULT_EASE, 1)).toBe(1);
  });

  it('clamps progress outside 0..1', () => {
    expect(cubicBezierEase(DEFAULT_EASE, -2)).toBe(0);
    expect(cubicBezierEase(DEFAULT_EASE, 4)).toBe(1);
  });

  it('is the identity for a linear curve', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezierEase(LINEARISH, t)).toBeCloseTo(t, 6);
    }
  });

  it('stays monotonic', () => {
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) {
      const value = cubicBezierEase([0.42, 0, 0.58, 1], step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('eases in: the first half covers less than half the distance', () => {
    expect(cubicBezierEase([0.42, 0, 1, 1], 0.5)).toBeLessThan(0.5);
  });

  it('eases out: the first half covers more than half the distance', () => {
    expect(cubicBezierEase([0, 0, 0.58, 1], 0.5)).toBeGreaterThan(0.5);
  });

  it('handles a degenerate curve without hanging', () => {
    const value = cubicBezierEase([0, 0, 0, 0], 0.5);
    expect(Number.isFinite(value)).toBe(true);
  });
});

describe('isValidEase', () => {
  it('accepts four finite numbers with x controls in range', () => {
    expect(isValidEase([0.25, 0.1, 0.25, 1])).toBe(true);
    expect(isValidEase([0, -2, 1, 3])).toBe(true);
  });

  it('rejects wrong shapes and out-of-range x controls', () => {
    expect(isValidEase([0, 0, 0])).toBe(false);
    expect(isValidEase('ease')).toBe(false);
    expect(isValidEase([1.2, 0, 0.5, 1])).toBe(false);
    expect(isValidEase([0.5, 0, Number.NaN, 1])).toBe(false);
  });
});

describe('clip validation', () => {
  it('accepts bezier with control points', () => {
    expect(validateClip(clipWith('bezier', DEFAULT_EASE))).toEqual([]);
  });

  it('accepts bezier without control points (falls back at sample time)', () => {
    expect(validateClip(clipWith('bezier'))).toEqual([]);
  });

  it('rejects malformed control points', () => {
    const errors = validateClip(clipWith('bezier', [2, 0, 0.5, 1] as [number, number, number, number]));
    expect(errors.some((error) => error.includes('.ease'))).toBe(true);
  });

  it('rejects an unknown easing name', () => {
    const bad = clipWith('linear');
    (bad.tracks[0].keyframes[0] as { easing: string }).easing = 'bounce';
    expect(validateClip(bad).some((error) => error.includes('linear, step or bezier'))).toBe(true);
  });
});

describe('sampler', () => {
  it('follows the curve instead of the straight line', () => {
    const eased = sampleTrack(clipWith('bezier', [0.42, 0, 1, 1]).tracks[0], 0.5).position!;
    const linear = sampleTrack(clipWith('linear').tracks[0], 0.5).position!;
    expect(linear.x).toBeCloseTo(5, 6);
    expect(eased.x).toBeLessThan(linear.x);
    expect(eased.x).toBeCloseTo(10 * cubicBezierEase([0.42, 0, 1, 1], 0.5), 6);
  });

  it('holds the left value for step easing', () => {
    expect(sampleTrack(clipWith('step').tracks[0], 0.9).position!.x).toBe(0);
    expect(sampleTrack(clipWith('step').tracks[0], 1).position!.x).toBe(10);
  });
});

describe('three expansion', () => {
  const resolve = () => new THREE.Object3D();
  const timesOf = (clip: MochiAnimationClip) => [...toThreeClip(clip, resolve).tracks[0].times];

  it('leaves a linear segment at two keys', () => {
    expect(timesOf(clipWith('linear'))).toHaveLength(2);
  });

  it('subdivides a bezier segment', () => {
    const times = timesOf(clipWith('bezier', DEFAULT_EASE));
    expect(times.length).toBeGreaterThan(2);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(1);
    // Strictly increasing, or the track is invalid.
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThan(times[index - 1]);
    }
  });

  it('matches the sampler at every inserted key', () => {
    const clip = clipWith('bezier', [0.42, 0, 1, 1]);
    const track = toThreeClip(clip, resolve).tracks[0];
    for (let index = 0; index < track.times.length; index += 1) {
      const sampled = sampleTrack(clip.tracks[0], track.times[index]).position!.x;
      expect(track.values[index * 3]).toBeCloseTo(sampled, 3);
    }
  });

  it('emits a hold key for a step segment', () => {
    const times = timesOf(clipWith('step'));
    expect(times).toHaveLength(3);
    expect(times[1]).toBeGreaterThan(0.99);
    expect(times[1]).toBeLessThan(1);
  });
});
