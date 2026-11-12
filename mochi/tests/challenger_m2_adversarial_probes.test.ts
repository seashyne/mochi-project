// Empirical Challenger Adversarial Probes for Milestone 2 Iteration 2
// Rigorous verification of manifest sanitization and avatar state machine transitions

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildHumanoidAvatar,
  stepWalkCycle,
  setJumpPose,
  HumanoidAvatarInstance
} from '../src/engine/avatar/avatarBuilder';
import { PhysicsWorld } from '../src/engine/physics';
import {
  parseManifestObjects,
  loadWorldFromManifest,
  DEFAULT_STARTER_OBJECTS
} from '../src/engine/scene/sceneLoader';

describe('Adversarial Challenge: Manifest Sanitization & Robustness', () => {
  it('handles null, undefined, malformed strings, and non-array records', () => {
    const corruptedInputs = [
      null,
      undefined,
      '',
      '   ',
      '{ bad json %$# }',
      '12345',
      'true',
      'false',
      'null',
      '{}',
      '{"not_objects": 42}',
      '{"objects": "not_an_array"}',
      '{"objects": null}',
      '{"objects": []}',
      []
    ];

    for (const input of corruptedInputs) {
      const objects = parseManifestObjects(input);
      expect(objects).toEqual(DEFAULT_STARTER_OBJECTS);
      expect(objects.length).toBe(6);
    }
  });

  it('rejects primitives, nulls, and nested arrays inside manifest arrays', () => {
    const malformedArrays = [
      ['string_entry'],
      [12345, true, false, null, undefined],
      [['nested', 'array'], [1, 2, 3]],
      [null, undefined, {}, 'just_text']
    ];

    for (const arr of malformedArrays) {
      const objects = parseManifestObjects(arr);
      expect(objects.length).toBeGreaterThan(0);
      for (const obj of objects) {
        expect(typeof obj.id).toBe('string');
        expect(typeof obj.name).toBe('string');
        expect(typeof obj.type).toBe('string');
        expect(Number.isFinite(obj.position.x)).toBe(true);
        expect(Number.isFinite(obj.position.y)).toBe(true);
        expect(Number.isFinite(obj.position.z)).toBe(true);
        expect(Number.isFinite(obj.rotation.x)).toBe(true);
        expect(Number.isFinite(obj.rotation.y)).toBe(true);
        expect(Number.isFinite(obj.rotation.z)).toBe(true);
        expect(Number.isFinite(obj.scale.x)).toBe(true);
        expect(Number.isFinite(obj.scale.y)).toBe(true);
        expect(Number.isFinite(obj.scale.z)).toBe(true);
      }
    }
  });

  it('sanitizes objects with missing or non-finite coordinates in loadWorldFromManifest', () => {
    const scene = new THREE.Scene();
    const physicsWorld = new PhysicsWorld();

    const manifestWithCorruptedCoords = {
      objects: [
        { id: '', name: '   ', type: 'spawn', position: null, rotation: undefined, scale: 'bad' },
        { id: 'p1', type: 'platform', position: { x: NaN, y: Infinity, z: -Infinity } },
        { id: 'p2', type: 'block', rotation: { x: '0', y: null, z: {} }, scale: { x: -4, y: 0, z: -0.01 } },
        { id: 'jp', type: 'jump_pad', position: { x: 5, y: 2, z: 5 } },
        { id: 'hz', type: 'hazard', scale: { x: NaN, y: NaN, z: NaN } },
        { id: 'c1', type: 'coin', scale: { x: -2, y: -2, z: -2 } },
        { id: 'unk', type: 'laser_grid_v9' as unknown as 'block' }
      ]
    };

    expect(() => {
      const result = loadWorldFromManifest(scene, manifestWithCorruptedCoords, physicsWorld);
      expect(result.success).toBe(true);
      expect(result.objectsCount).toBe(7);
      expect(result.meshes.length).toBe(7);
      // Unknown object type 'laser_grid_v9' renders as visual mesh without physical collision body
      expect(result.bodies.length).toBe(6);

      for (const mesh of result.meshes) {
        expect(Number.isFinite(mesh.position.x)).toBe(true);
        expect(Number.isFinite(mesh.position.y)).toBe(true);
        expect(Number.isFinite(mesh.position.z)).toBe(true);
      }

      for (const body of result.bodies) {
        expect(Number.isFinite(body.position.x)).toBe(true);
        expect(Number.isFinite(body.position.y)).toBe(true);
        expect(Number.isFinite(body.position.z)).toBe(true);
        if (body.shape.type === 'box') {
          expect(body.shape.halfExtents.x).toBeGreaterThanOrEqual(0.1);
          expect(body.shape.halfExtents.y).toBeGreaterThanOrEqual(0.1);
          expect(body.shape.halfExtents.z).toBeGreaterThanOrEqual(0.1);
        } else if (body.shape.type === 'sphere') {
          expect(body.shape.radius).toBeGreaterThanOrEqual(0.2);
        }
      }

      result.dispose();
      expect(scene.children.length).toBe(0);
      expect(physicsWorld.getAllBodies().length).toBe(0);
    }).not.toThrow();
  });
});

describe('Adversarial Challenge: Avatar State Machine & Transitions', () => {
  it('correctly transitions: idle -> walk -> jump -> stationary landing -> idle', () => {
    const avatar = buildHumanoidAvatar();
    expect(avatar.state).toBe('idle');
    expect(avatar.parts.leftArm.rotation.x).toBe(0);
    expect(avatar.parts.rightArm.rotation.x).toBe(0);

    // 1. Move at walk speed
    stepWalkCycle(avatar, 4.0, 0.016);
    expect(avatar.state).toBe('walk');
    expect(avatar.walkPhase).toBeGreaterThan(0);

    // 2. Take off into air
    setJumpPose(avatar, true);
    expect(avatar.state).toBe('jump');
    expect(avatar.parts.leftArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);
    expect(avatar.parts.rightArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);
    expect(avatar.parts.leftLeg.rotation.x).toBeCloseTo(0.3, 4);

    // 3. Stationary landing (speed = 0)
    stepWalkCycle(avatar, 0, 0.016);
    expect(avatar.state).toBe('idle');
    expect(avatar.walkPhase).toBe(0);
    expect(avatar.parts.leftArm.rotation.x).toBe(0);
    expect(avatar.parts.rightArm.rotation.x).toBe(0);
    expect(avatar.parts.leftLeg.rotation.x).toBe(0);
    expect(avatar.parts.rightLeg.rotation.x).toBe(0);

    // 4. Subsequent stationary frames must maintain idle without jitter
    for (let frame = 0; frame < 60; frame++) {
      stepWalkCycle(avatar, 0, 0.016);
      expect(avatar.state).toBe('idle');
      expect(avatar.parts.leftArm.rotation.x).toBe(0);
    }

    avatar.dispose();
  });

  it('correctly transitions: jump -> moving landing -> walk', () => {
    const avatar = buildHumanoidAvatar();
    setJumpPose(avatar, true);
    expect(avatar.state).toBe('jump');

    // Moving landing: speed = 6.0
    stepWalkCycle(avatar, 6.0, 0.016);
    expect(avatar.state).toBe('walk');
    expect(avatar.walkPhase).toBeGreaterThan(0);
    expect(Math.abs(avatar.parts.leftArm.rotation.x)).toBeGreaterThan(0);

    avatar.dispose();
  });

  it('correctly handles jump release: setJumpPose(false)', () => {
    const avatar = buildHumanoidAvatar();
    setJumpPose(avatar, true);
    expect(avatar.state).toBe('jump');

    setJumpPose(avatar, false);
    expect(avatar.state).toBe('idle');
    expect(avatar.walkPhase).toBe(0);
    expect(avatar.parts.leftArm.rotation.x).toBe(0);
    expect(avatar.parts.rightArm.rotation.x).toBe(0);
    expect(avatar.parts.leftLeg.rotation.x).toBe(0);

    avatar.dispose();
  });

  it('handles speed thresholds and boundary values without state corruption', () => {
    const avatar = buildHumanoidAvatar();

    // Boundary speed: 0.05 is threshold
    setJumpPose(avatar, true);
    stepWalkCycle(avatar, 0.05, 0.016);
    expect(avatar.state).toBe('idle');

    setJumpPose(avatar, true);
    stepWalkCycle(avatar, 0.05001, 0.016);
    expect(avatar.state).toBe('walk');

    // Negative speeds and NaN
    setJumpPose(avatar, true);
    stepWalkCycle(avatar, -5.0, 0.016);
    expect(avatar.state).toBe('idle');

    setJumpPose(avatar, true);
    stepWalkCycle(avatar, Number.NaN, 0.016);
    expect(avatar.state).toBe('idle');

    avatar.dispose();
  });

  it('maintains strict invariants over 5,000 randomized state actions', () => {
    const avatar: HumanoidAvatarInstance = buildHumanoidAvatar();

    for (let step = 0; step < 5000; step++) {
      const action = step % 4;
      if (action === 0) {
        setJumpPose(avatar, true);
      } else if (action === 1) {
        setJumpPose(avatar, false);
      } else if (action === 2) {
        const randSpeed = (step % 10) * 1.5;
        stepWalkCycle(avatar, randSpeed, 0.016);
      } else {
        stepWalkCycle(avatar, 0, 0.016);
      }

      // Assert Invariants
      expect(['idle', 'walk', 'jump']).toContain(avatar.state);
      expect(Number.isFinite(avatar.walkPhase)).toBe(true);

      const parts = [
        avatar.parts.leftArm,
        avatar.parts.rightArm,
        avatar.parts.leftLeg,
        avatar.parts.rightLeg
      ];

      for (const part of parts) {
        expect(Number.isFinite(part.rotation.x)).toBe(true);
      }

      if (avatar.state === 'idle') {
        expect(avatar.parts.leftArm.rotation.x).toBe(0);
        expect(avatar.parts.rightArm.rotation.x).toBe(0);
        expect(avatar.parts.leftLeg.rotation.x).toBe(0);
        expect(avatar.parts.rightLeg.rotation.x).toBe(0);
      } else if (avatar.state === 'jump') {
        expect(avatar.parts.leftArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);
        expect(avatar.parts.rightArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);
        expect(avatar.parts.leftLeg.rotation.x).toBeCloseTo(0.3, 4);
      } else if (avatar.state === 'walk') {
        for (const part of parts) {
          expect(Math.abs(part.rotation.x)).toBeLessThanOrEqual(0.601);
        }
      }
    }

    avatar.dispose();
  });
});
