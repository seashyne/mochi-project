// Spatial audio maths: rolloff, panning and Doppler, without an AudioContext.

import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIBLE_DISTANCE,
  attenuationGain,
  distance3d,
  dopplerRatio,
  panFor,
  ratioToCents
} from '../src/engine/runtime/audioSpatial';

const listener = (x: number, z: number, yaw = 0) => ({ x, y: 0, z, yaw });

describe('attenuationGain', () => {
  it('is full volume inside the reference distance', () => {
    expect(attenuationGain(0)).toBe(1);
    expect(attenuationGain(1.9)).toBe(1);
  });

  it('falls off monotonically and reaches silence at the limit', () => {
    const near = attenuationGain(5);
    const mid = attenuationGain(15);
    const far = attenuationGain(25);

    expect(near).toBeLessThan(1);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(attenuationGain(MAX_AUDIBLE_DISTANCE)).toBe(0);
    expect(attenuationGain(MAX_AUDIBLE_DISTANCE + 10)).toBe(0);
  });

  it('tapers over the last tenth so a sound does not cut off', () => {
    const taperStart = MAX_AUDIBLE_DISTANCE * 0.9;
    const justInside = attenuationGain(taperStart);
    const nearlyOut = attenuationGain(MAX_AUDIBLE_DISTANCE - 0.5);
    expect(nearlyOut).toBeLessThan(justInside * 0.5);
  });

  it('honours a custom reference distance and rolloff', () => {
    expect(attenuationGain(4, { refDistance: 4 })).toBe(1);
    const soft = attenuationGain(10, { rolloff: 0.5 });
    const hard = attenuationGain(10, { rolloff: 2 });
    expect(soft).toBeGreaterThan(hard);
  });

  it('treats a non-finite distance as inaudible', () => {
    expect(attenuationGain(Number.NaN)).toBe(0);
  });
});

describe('panFor', () => {
  it('puts a source on the right at +1 and on the left at -1', () => {
    expect(panFor(listener(0, 0), { x: 5, y: 0, z: 0 })).toBeCloseTo(1, 6);
    expect(panFor(listener(0, 0), { x: -5, y: 0, z: 0 })).toBeCloseTo(-1, 6);
  });

  it('is centred directly ahead, behind, and on top of the listener', () => {
    expect(panFor(listener(0, 0), { x: 0, y: 0, z: 5 })).toBeCloseTo(0, 6);
    expect(panFor(listener(0, 0), { x: 0, y: 0, z: -5 })).toBeCloseTo(0, 6);
    expect(panFor(listener(0, 0), { x: 0.1, y: 0, z: 0.1 })).toBe(0);
  });

  it('rotates with the listener: facing +X makes -Z the right-hand side', () => {
    expect(panFor(listener(0, 0, Math.PI / 2), { x: 0, y: 0, z: -5 })).toBeCloseTo(1, 6);
    expect(panFor(listener(0, 0, Math.PI / 2), { x: 5, y: 0, z: 0 })).toBeCloseTo(0, 6);
  });

  it('stays inside the stereo range for a diagonal source', () => {
    const pan = panFor(listener(0, 0), { x: 5, y: 0, z: 5 });
    expect(pan).toBeGreaterThan(0);
    expect(pan).toBeLessThan(1);
  });
});

describe('dopplerRatio', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const ahead = { x: 0, y: 0, z: 10 };

  it('is 1 when nobody moves', () => {
    expect(dopplerRatio(origin, ahead, { x: 0, y: 0, z: 0 })).toBeCloseTo(1, 6);
  });

  it('rises for a source closing on the listener and falls when it leaves', () => {
    const closing = dopplerRatio(origin, ahead, { x: 0, y: 0, z: -20 });
    const leaving = dopplerRatio(origin, ahead, { x: 0, y: 0, z: 20 });
    expect(closing).toBeGreaterThan(1);
    expect(leaving).toBeLessThan(1);
  });

  it('clamps absurd velocities instead of returning infinity', () => {
    const absurd = dopplerRatio(origin, ahead, { x: 0, y: 0, z: -4000 });
    expect(absurd).toBeLessThanOrEqual(2);
    expect(Number.isFinite(absurd)).toBe(true);
  });

  it('returns 1 for a source at the listener', () => {
    expect(dopplerRatio(origin, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 })).toBe(1);
  });
});

describe('distance3d and ratioToCents', () => {
  it('measures plain 3D distance', () => {
    expect(distance3d({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6);
  });

  it('maps a pitch ratio to cents', () => {
    expect(ratioToCents(2)).toBeCloseTo(1200, 6);
    expect(ratioToCents(0.5)).toBeCloseTo(-1200, 6);
    expect(ratioToCents(1)).toBeCloseTo(0, 6);
  });
});
