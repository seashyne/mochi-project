// Camera framing contract: the editor frames the document once when it opens,
// so the fit maths has to be predictable and must never move the camera when
// there is nothing to frame.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { StudioCameraRig } from '../src/engine/studio/studioCameraRig';
import { frameObjects } from '../src/engine/studio/sceneFraming';

const rig = () => new StudioCameraRig(new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000));

function box(size: number, at: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  mesh.position.set(...at);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('frameObjects', () => {
  it('leaves the camera alone when there is nothing to frame', () => {
    const camera = rig();
    const before = camera.getState();
    expect(frameObjects(camera, [])).toBe(false);
    expect(camera.getState()).toEqual(before);
  });

  it('centres on a single object and backs off to at least the minimum radius', () => {
    const camera = rig();
    expect(frameObjects(camera, [box(2, [10, 4, -6])])).toBe(true);
    const state = camera.getState();
    expect(state.target).toEqual({ x: 10, y: 4, z: -6 });
    expect(state.radius).toBe(6);
  });

  it('fits the combined bounds of several objects', () => {
    const camera = rig();
    frameObjects(camera, [box(2, [-10, 0, 0]), box(2, [10, 0, 0])]);
    const state = camera.getState();
    expect(state.target.x).toBeCloseTo(0, 6);
    expect(state.radius).toBeGreaterThan(10);
  });

  it('scales the radius with the scene extent', () => {
    const small = rig();
    const large = rig();
    frameObjects(small, [box(4)]);
    frameObjects(large, [box(64)]);
    expect(large.getState().radius).toBeGreaterThan(small.getState().radius * 5);
  });

  it('clamps very large scenes to the rig ceiling', () => {
    const camera = rig();
    frameObjects(camera, [box(400)]);
    expect(camera.getState().radius).toBeLessThanOrEqual(120);
  });
});
