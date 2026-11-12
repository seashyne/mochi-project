// Adversarial Vitest Challenge Suite for Milestone 2: 3D Engine Math, Camera, Avatar Rig & Scene Loader
// Empirical stress testing across 360-degree orientations, pitch clamp, extreme speeds, and malformed manifests

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  buildHumanoidAvatar,
  stepWalkCycle,
  setJumpPose
} from '../src/engine/avatar/avatarBuilder';
import { FollowCamera } from '../src/engine/camera/followCamera';
import {
  computeCameraRelativeVelocity,
  PhysicsWorld
} from '../src/engine/physics';
import {
  loadWorldFromManifest,
  parseManifestObjects,
  DEFAULT_STARTER_OBJECTS
} from '../src/engine/scene/sceneLoader';
import { StudioObject } from '../src/engine/studio/types';

describe('Empirical Challenger: Milestone 2 3D Engine Stress Harness', () => {
  // Probe 1: 360-degree Orientations & Camera-Relative Velocity Math
  describe('Probe 1: 360-degree Orientations & Camera-Relative Math', () => {
    const ANGLES = [
      { deg: 0, rad: 0 },
      { deg: 45, rad: Math.PI / 4 },
      { deg: 90, rad: Math.PI / 2 },
      { deg: 135, rad: (3 * Math.PI) / 4 },
      { deg: 180, rad: Math.PI },
      { deg: 225, rad: (5 * Math.PI) / 4 },
      { deg: 270, rad: (3 * Math.PI) / 2 },
      { deg: 315, rad: (7 * Math.PI) / 4 }
    ];

    it.each(ANGLES)('preserves speed normalization (6.0) under diagonal inputs at $deg deg', ({ rad }) => {
      [
        { f: 1, s: 1 },
        { f: 1, s: -1 },
        { f: -1, s: 1 },
        { f: -1, s: -1 }
      ].forEach((input) => {
        const vel = computeCameraRelativeVelocity({ forward: input.f, strafe: input.s }, rad, 6.0);
        expect(Math.hypot(vel.vx, vel.vz)).toBeCloseTo(6.0, 4);
      });
    });

    it('verifies exact directional vector matches across cardinal camera yaw angles', () => {
      const at0 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, 0, 6.0);
      expect(at0.vx).toBeCloseTo(0, 4);
      expect(at0.vz).toBeCloseTo(6.0, 4);

      const at90 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI / 2, 6.0);
      expect(at90.vx).toBeCloseTo(6.0, 4);
      expect(at90.vz).toBeCloseTo(0, 4);

      const at180 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI, 6.0);
      expect(at180.vx).toBeCloseTo(0, 4);
      expect(at180.vz).toBeCloseTo(-6.0, 4);

      const at270 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, (3 * Math.PI) / 2, 6.0);
      expect(at270.vx).toBeCloseTo(-6.0, 4);
      expect(at270.vz).toBeCloseTo(0, 4);
    });

    it('handles periodic yaw wrap-around across huge positive and negative turns', () => {
      const base = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI / 4, 6.0);
      const wrapPos = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI / 4 + 100 * Math.PI, 6.0);
      const wrapNeg = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI / 4 - 80 * Math.PI, 6.0);
      expect(wrapPos.vx).toBeCloseTo(base.vx, 4);
      expect(wrapNeg.vx).toBeCloseTo(base.vx, 4);
    });

    it('handles extreme magnitude inputs and subnormal floats without exploding or producing NaN', () => {
      const zero = computeCameraRelativeVelocity({ forward: 0, strafe: 0 }, 0, 6.0);
      expect(zero.vx).toBe(0);
      expect(zero.vz).toBe(0);
      expect(zero.facingAngle).toBe(0);

      const huge = computeCameraRelativeVelocity({ forward: 1e9, strafe: 1e9 }, Math.PI / 3, 6.0);
      expect(Math.hypot(huge.vx, huge.vz)).toBeCloseTo(6.0, 4);
      expect(Number.isFinite(huge.vx)).toBe(true);

      const tiny = computeCameraRelativeVelocity({ forward: 1e-15, strafe: 1e-15 }, 0, 6.0);
      expect(Math.hypot(tiny.vx, tiny.vz)).toBeCloseTo(6.0, 4);
    });
  });

  // Probe 2: FollowCamera Pitch Clamp & Gimbal Lock Prevention
  describe('Probe 2: FollowCamera Pitch Clamp & Gimbal Lock Prevention', () => {
    let camera: FollowCamera;
    let threeCam: THREE.PerspectiveCamera;

    beforeEach(() => {
      camera = new FollowCamera({ target: { x: 0, y: 1.0, z: 0 }, radius: 6.0 });
      threeCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    });

    it('clamps pitch angle to [minPhi, maxPhi] under extreme vertical mouse flicks', () => {
      camera.orbit(0, -1000000);
      expect(camera.getPitch()).toBe(camera.minPhi);
      expect(camera.getPitch()).toBeGreaterThanOrEqual(0.1);

      camera.orbit(0, 2000000);
      expect(camera.getPitch()).toBe(camera.maxPhi);
      expect(camera.getPitch()).toBeLessThanOrEqual(Math.PI / 2 - 0.05);
    });

    it('prevents camera gimbal lock singularity and maintains non-degenerate lookAt matrix', () => {
      camera.orbit(0, -1000000);
      camera.update(threeCam, 0.016);
      expect(Number.isFinite(threeCam.position.x)).toBe(true);
      expect(Number.isFinite(threeCam.position.y)).toBe(true);
      expect(Number.isFinite(threeCam.position.z)).toBe(true);
      expect(threeCam.position.y).toBeGreaterThan(camera.target.y);

      const fwd = camera.getForwardVector();
      const right = camera.getRightVector();
      expect(fwd.length()).toBeCloseTo(1.0, 5);
      expect(right.length()).toBeCloseTo(1.0, 5);
      expect(fwd.dot(right)).toBeCloseTo(0, 5);
    });

    it('bounds distance zoom strictly between minRadius (2.0) and maxRadius (20.0)', () => {
      camera.zoom(-999999);
      expect(camera.getRadius()).toBe(camera.minRadius);
      camera.zoom(999999);
      expect(camera.getRadius()).toBe(camera.maxRadius);
    });

    it('maintains stability under 5,000 continuous random orbit delta steps', () => {
      for (let i = 0; i < 5000; i++) {
        camera.orbit(Math.sin(i * 13) * 100, Math.cos(i * 17) * 100);
      }
      camera.update(threeCam, 0.016);
      expect(Number.isFinite(camera.getYaw())).toBe(true);
      expect(camera.getPitch()).toBeGreaterThanOrEqual(camera.minPhi);
      expect(camera.getPitch()).toBeLessThanOrEqual(camera.maxPhi);
      expect(Number.isFinite(threeCam.position.x)).toBe(true);
    });
  });

  // Probe 3: Avatar Rig Limb Angles Under Extreme Speeds & State Transitions
  describe('Probe 3: Avatar Rig Limb Angles Under Extreme Speeds & Transitions', () => {
    it('restricts limb rotation angles strictly to [-0.6, 0.6] rad during extreme walk speeds', () => {
      const avatar = buildHumanoidAvatar();
      [10.0, 100.0, 1000.0, 1e6].forEach((spd) => {
        stepWalkCycle(avatar, spd, 0.016);
        expect(avatar.state).toBe('walk');
        expect(Math.abs(avatar.parts.leftArm.rotation.x)).toBeLessThanOrEqual(0.601);
        expect(Math.abs(avatar.parts.rightArm.rotation.x)).toBeLessThanOrEqual(0.601);
        expect(Math.abs(avatar.parts.leftLeg.rotation.x)).toBeLessThanOrEqual(0.601);
        expect(Math.abs(avatar.parts.rightLeg.rotation.x)).toBeLessThanOrEqual(0.601);
      });
      avatar.dispose();
    });

    it('survives rapid high-frequency jump-fall transitions without limb drift', () => {
      const avatar = buildHumanoidAvatar();
      for (let i = 0; i < 100; i++) {
        setJumpPose(avatar, true);
        expect(avatar.state).toBe('jump');
        expect(avatar.parts.leftArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);

        setJumpPose(avatar, false);
        expect(avatar.state).toBe('idle');
        expect(avatar.parts.leftArm.rotation.x).toBe(0);
        expect(avatar.parts.leftLeg.rotation.x).toBe(0);
      }
      avatar.dispose();
    });

    it('resets jump pose to idle upon stationary landing with stepWalkCycle(0)', () => {
      const avatar = buildHumanoidAvatar();
      setJumpPose(avatar, true);
      expect(avatar.state).toBe('jump');

      // When player lands grounded with speed 0, stepWalkCycle(0) transitions jump state to idle
      stepWalkCycle(avatar, 0, 0.016);
      expect(avatar.state).toBe('idle');
      expect(avatar.parts.leftArm.rotation.x).toBe(0);

      setJumpPose(avatar, false);
      expect(avatar.state).toBe('idle');
      avatar.dispose();
    });
  });

  // Probe 4: Dynamic Scene Loader Stress & Malformed Manifest Parsing
  describe('Probe 4: Dynamic Scene Loader Stress & Malformed Manifest Parsing', () => {
    it('falls back to default starter objects on empty or non-array inputs', () => {
      const badInputs = [
        null, undefined, '', '   ', '{ bad json }',
        '{"objects": []}', '{"objects": null}', '12345', true, []
      ];
      for (const input of badInputs) {
        const objects = parseManifestObjects(input);
        expect(objects).toEqual(DEFAULT_STARTER_OBJECTS);
        expect(objects.length).toBe(6);
      }
    });

    it('gracefully handles malformed manifest arrays and objects with missing coordinates without throwing', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      const stringArray = parseManifestObjects('["malformed_entry"]');
      expect(stringArray).toEqual(DEFAULT_STARTER_OBJECTS);

      expect(() => {
        loadWorldFromManifest(scene, '["malformed_entry"]', world).dispose();
        loadWorldFromManifest(scene, { objects: [{ id: 'no_pos', type: 'platform' }] }, world).dispose();
      }).not.toThrow();
    });

    it('handles unknown object types without crashing by falling back to box mesh', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      const manifest = {
        objects: [{
          id: 'exotic_01',
          name: 'Laser Turret',
          type: 'laser_turret' as unknown as StudioObject['type'],
          position: { x: 0, y: 1, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 2, y: 2, z: 2 },
          color: '#ff0055'
        }]
      };

      const result = loadWorldFromManifest(scene, manifest, world);
      expect(result.success).toBe(true);
      expect(result.objectsCount).toBe(1);
      expect(scene.children.length).toBe(1);
      result.dispose();
      expect(scene.children.length).toBe(0);
    });

    it('clamps negative or zero scales to safe minimums in physics bodies', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      const manifest = {
        objects: [{
          id: 'neg_platform',
          name: 'Inverted Platform',
          type: 'platform',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: -4, y: 0, z: -8 },
          color: '#112233'
        }]
      };

      const result = loadWorldFromManifest(scene, manifest, world);
      expect(result.success).toBe(true);
      const body = world.getBody('physics_neg_platform');
      expect(body).toBeDefined();
      if (body?.shape.type === 'box') {
        expect(body.shape.halfExtents.x).toBeGreaterThanOrEqual(0.1);
        expect(body.shape.halfExtents.y).toBeGreaterThanOrEqual(0.1);
        expect(body.shape.halfExtents.z).toBeGreaterThanOrEqual(0.1);
      }
      result.dispose();
    });

    it('stresses scene loading with 100 objects and validates leak-free disposal', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      const denseObjects: StudioObject[] = Array.from({ length: 100 }, (_, i) => ({
        id: `dense_${i}`,
        name: `Dense Object ${i}`,
        type: i % 2 === 0 ? 'platform' : 'coin',
        position: { x: (i % 10) * 2, y: Math.floor(i / 10), z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#3b82f6'
      }));

      const result = loadWorldFromManifest(scene, { objects: denseObjects }, world);
      expect(result.success).toBe(true);
      expect(result.objectsCount).toBe(100);
      expect(result.meshes.length).toBe(2);
      expect(scene.children.length).toBe(2);
      const platforms = scene.getObjectByName('instances_box') as THREE.InstancedMesh;
      const coins = scene.getObjectByName('instances_coin') as THREE.InstancedMesh;
      expect(platforms.count).toBe(50);
      expect(coins.count).toBe(50);

      result.dispose();
      expect(scene.children.length).toBe(0);
      expect(result.meshes.length).toBe(0);
      expect(result.bodies.length).toBe(0);
    });
  });
});
