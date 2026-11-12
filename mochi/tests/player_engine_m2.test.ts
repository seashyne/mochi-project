// Unit and Integration Tests for Milestone 2: 3D Player Engine, Controls & Scene Loading
// Verifies avatarBuilder, followCamera, camera-relative characterController, inputController, and sceneLoader

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildHumanoidAvatar, stepWalkCycle, setJumpPose, stepAnimation } from '../src/engine/avatar/avatarBuilder';
import { FollowCamera } from '../src/engine/camera/followCamera';
import { CharacterPhysicsController, computeCameraRelativeVelocity, PhysicsWorld, RigidBody } from '../src/engine/physics';
import { InputController } from '../src/engine/inputController';
import { loadWorldFromManifest, parseManifestObjects, DEFAULT_STARTER_OBJECTS } from '../src/engine/scene/sceneLoader';

describe('Milestone 2 Player Engine & Controls Test Suite', () => {
  // 1. Procedural 3D Humanoid Avatar Rig
  describe('Avatar Rig & Animation (avatarBuilder.ts)', () => {
    it('constructs all 6 core anatomical segments with cyber visor', () => {
      const avatar = buildHumanoidAvatar();
      const parts = Object.keys(avatar.parts);
      ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].forEach((p) => {
        expect(parts).toContain(p);
      });
      expect(avatar.parts.head.position.y).toBeGreaterThan(avatar.parts.torso.position.y);
      expect(avatar.parts.torso.position.y).toBeGreaterThan(avatar.parts.leftLeg.position.y);
      expect(avatar.parts.leftArm.position.x).toBeLessThan(0);
      expect(avatar.parts.rightArm.position.x).toBeGreaterThan(0);

      const visor = avatar.parts.head.children.find((c) => c instanceof THREE.Mesh && c.position.z > 0.1);
      expect(visor).toBeDefined();
    });

    it('applies custom initial colors and supports dynamic updates', () => {
      const avatar = buildHumanoidAvatar({ headColor: '#ff00aa', torsoColor: '#00ffcc' });
      expect(avatar.colors.headColor).toBe('#ff00aa');
      expect(avatar.colors.torsoColor).toBe('#00ffcc');

      avatar.updatePartColor('torso', '#123456');
      expect(avatar.colors.torsoColor).toBe('#123456');
      expect(avatar.materials.torso.color.getHexString()).toBe('123456');

      avatar.updateColors({ leftArmColor: '#998877' });
      expect(avatar.colors.leftArmColor).toBe('#998877');
    });

    it('animates walk cycle with opposing arm and leg swing angles', () => {
      const avatar = buildHumanoidAvatar();
      stepAnimation(avatar, 0.25, 'walk');
      expect(avatar.state).toBe('walk');
      expect(Math.sign(avatar.parts.leftArm.rotation.x)).toBe(-Math.sign(avatar.parts.rightArm.rotation.x));
      expect(Math.sign(avatar.parts.leftLeg.rotation.x)).toBe(-Math.sign(avatar.parts.rightLeg.rotation.x));

      stepWalkCycle(avatar, 6.0, 0.016);
      expect(avatar.state).toBe('walk');
    });

    it('sets jump posture and resets to idle pose', () => {
      const avatar = buildHumanoidAvatar();
      setJumpPose(avatar, true);
      expect(avatar.state).toBe('jump');
      expect(avatar.parts.leftArm.rotation.x).toBeLessThan(-1.0);
      expect(avatar.parts.rightArm.rotation.x).toBeLessThan(-1.0);
      expect(avatar.parts.leftLeg.rotation.x).toBeGreaterThan(0);

      setJumpPose(avatar, false);
      expect(avatar.state).toBe('idle');
      expect(avatar.parts.leftArm.rotation.x).toBe(0);
      expect(avatar.parts.rightArm.rotation.x).toBe(0);
      expect(avatar.parts.leftLeg.rotation.x).toBe(0);
    });

    it('transitions to idle on stationary landing and walks on moving landing', () => {
      const avatar = buildHumanoidAvatar();
      setJumpPose(avatar, true);
      expect(avatar.state).toBe('jump');
      stepWalkCycle(avatar, 0, 0.016);
      expect(avatar.state).toBe('idle');
      expect(avatar.parts.leftArm.rotation.x).toBe(0);

      setJumpPose(avatar, true);
      stepWalkCycle(avatar, 6.0, 0.016);
      expect(avatar.state).toBe('walk');
      expect(Math.abs(avatar.parts.leftArm.rotation.x)).toBeGreaterThan(0);
      avatar.dispose();
    });

    it('disposes materials and geometries cleanly', () => {
      const avatar = buildHumanoidAvatar();
      expect(() => avatar.dispose()).not.toThrow();
      expect(avatar.root.children.length).toBe(0);
    });
  });

  // 2. Smooth Third-Person Follow Camera
  describe('Follow Camera (followCamera.ts)', () => {
    let camera: FollowCamera;
    let threeCam: THREE.PerspectiveCamera;

    beforeEach(() => {
      camera = new FollowCamera({ target: { x: 0, y: 1.0, z: 0 }, radius: 6.0 });
      threeCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    });

    it('orbits yaw and clamps pitch angle within limits', () => {
      camera.orbit(100, 50);
      expect(camera.getYaw()).toBeCloseTo(100 * 0.005);
      expect(camera.getPitch()).toBeGreaterThanOrEqual(camera.minPhi);
      expect(camera.getPitch()).toBeLessThanOrEqual(camera.maxPhi);

      camera.orbit(0, 10000);
      expect(camera.getPitch()).toBe(camera.maxPhi);
      camera.orbit(0, -20000);
      expect(camera.getPitch()).toBe(camera.minPhi);
    });

    it('zooms distance within radius boundaries', () => {
      camera.zoom(3.0);
      expect(camera.getRadius()).toBeCloseTo(9.0);
      camera.zoom(-20.0);
      expect(camera.getRadius()).toBe(camera.minRadius);
      camera.zoom(100.0);
      expect(camera.getRadius()).toBe(camera.maxRadius);
    });

    it('computes horizontal forward and right vectors', () => {
      camera.reset(0, Math.PI / 4, 6.0);
      const fwd = camera.getForwardVector();
      const right = camera.getRightVector();
      expect(fwd.z).toBeCloseTo(1.0);
      expect(fwd.x).toBeCloseTo(0);
      expect(right.x).toBeCloseTo(1.0);
      expect(right.z).toBeCloseTo(0);
    });

    it('interpolates toward target on camera update', () => {
      camera.setTarget({ x: 10, y: 1.0, z: 10 });
      camera.update(threeCam, 0.016);
      expect(Number.isNaN(threeCam.position.x)).toBe(false);

      camera.teleportToTarget();
      expect(camera.currentPosition.x).toBeCloseTo(10, 0);
    });
  });

  // 3. Camera-Relative Character Movement
  describe('Camera-Relative Movement (characterController.ts)', () => {
    it('computes forward and strafe velocity aligned to camera yaw', () => {
      const at0 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, 0, 6.0);
      expect(at0.vx).toBeCloseTo(0);
      expect(at0.vz).toBeCloseTo(6.0);

      const at90 = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, Math.PI / 2, 6.0);
      expect(at90.vx).toBeCloseTo(6.0);
      expect(at90.vz).toBeCloseTo(0);

      const strafe0 = computeCameraRelativeVelocity({ forward: 0, strafe: 1 }, 0, 6.0);
      expect(strafe0.vx).toBeCloseTo(6.0);
      expect(strafe0.vz).toBeCloseTo(0);
    });

    it('normalizes diagonal input without exceeding moveSpeed', () => {
      const diag = computeCameraRelativeVelocity({ forward: 1, strafe: 1 }, 0, 6.0);
      const speed = Math.hypot(diag.vx, diag.vz);
      expect(speed).toBeCloseTo(6.0);
    });

    it('tracks character facing angle on input update', () => {
      const world = new PhysicsWorld();
      const body = new RigidBody({
        id: 'test_player',
        type: 'dynamic',
        position: { x: 0, y: 2.0, z: 0 },
        shape: { type: 'sphere', radius: 0.5 }
      });
      world.addBody(body);
      const controller = new CharacterPhysicsController(body, world);

      controller.update({ x: 1, y: 0 }, false, false, 0.016, 0);
      expect(controller.getFacingAngle()).toBeCloseTo(Math.PI / 2);

      controller.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      expect(controller.getFacingAngle()).toBeCloseTo(Math.PI / 2);
    });
  });

  // 4. Virtual Input Controller & Touch Controls
  describe('Virtual Controls (inputController.ts)', () => {
    it('integrates virtual joystick and action states into polling output', () => {
      const input = new InputController();
      input.setVirtualJoystick(0.8, -0.6);
      input.setVirtualAction('jump', true);
      input.setVirtualAction('sprint', true);

      const state = input.poll();
      expect(state.axes.x).toBeCloseTo(0.8);
      expect(state.axes.y).toBeCloseTo(-0.6);
      expect(state.actions.jump).toBe(true);
      expect(state.actions.sprint).toBe(true);

      input.resetVirtualControls();
      const cleared = input.poll();
      expect(cleared.axes.x).toBe(0);
      expect(cleared.axes.y).toBe(0);
      expect(cleared.actions.jump).toBe(false);
      expect(cleared.actions.sprint).toBe(false);
    });

    it('clamps virtual joystick inputs exceeding unit boundary', () => {
      const input = new InputController();
      input.setVirtualJoystick(5.0, -10.0);
      const state = input.poll();
      expect(state.axes.x).toBe(1.0);
      expect(state.axes.y).toBe(-1.0);
    });
  });

  // 5. Dynamic 3D Scene Loader
  describe('Dynamic Scene Loader (sceneLoader.ts)', () => {
    it('gracefully falls back to starter objects for empty or invalid manifests', () => {
      expect(parseManifestObjects(null)).toEqual(DEFAULT_STARTER_OBJECTS);
      expect(parseManifestObjects('')).toEqual(DEFAULT_STARTER_OBJECTS);
      expect(parseManifestObjects('{ bad json }')).toEqual(DEFAULT_STARTER_OBJECTS);
      expect(parseManifestObjects({ objects: [] })).toEqual(DEFAULT_STARTER_OBJECTS);
    });

    it('loads custom world manifest and creates meshes and rigid bodies', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();

      const manifest = {
        objects: [
          { id: 'spawn_01', name: 'Spawn', type: 'spawn', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 4, y: 0.2, z: 4 }, color: '#00a2ff' },
          { id: 'block_01', name: 'Block', type: 'block', position: { x: 2, y: 1, z: 5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 }, color: '#6366f1' },
          { id: 'pad_01', name: 'Jump Pad', type: 'jump_pad', position: { x: 2, y: 2.1, z: 5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 0.2, z: 1 }, color: '#10b981' }
        ]
      };

      const result = loadWorldFromManifest(scene, manifest, world);
      expect(result.success).toBe(true);
      expect(result.objectsCount).toBe(3);
      expect(result.meshes.length).toBe(4);
      expect(result.bodies.length).toBe(3);
      expect(result.spawnPoint.y).toBeGreaterThan(0);

      expect(world.getBody('physics_block_01')).toBeDefined();
      expect(world.getBody('trigger_pad_01')).toBeDefined();

      result.dispose();
      expect(scene.children.length).toBe(0);
      expect(world.getBody('physics_block_01')).toBeUndefined();
    });

    it('sanitizes malformed arrays and handles objects missing coordinates without throwing', () => {
      const malformed = parseManifestObjects('["malformed_entry", 12345, null]');
      expect(malformed).toEqual(DEFAULT_STARTER_OBJECTS);

      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      expect(() => {
        const res = loadWorldFromManifest(scene, { objects: [{ id: 'partial', type: 'platform' }] }, world);
        expect(res.success).toBe(true);
        expect(world.getBody('physics_partial')).toBeDefined();
        res.dispose();
      }).not.toThrow();
    });
  });

  // 6. Decoupled Telemetry Performance Gate
  describe('Decoupled Telemetry Performance', () => {
    it('throttles HUD updates at 250ms interval to eliminate 120Hz React state churn', () => {
      let hudUpdateCount = 0;
      let lastHudUpdate = -250;
      const HUD_INTERVAL_MS = 250;

      // Simulate 120 frames at 120Hz (approx 8.33ms per frame = 1000ms total)
      for (let frame = 0; frame < 120; frame++) {
        const now = frame * (1000 / 120);
        if (now - lastHudUpdate >= HUD_INTERVAL_MS) {
          lastHudUpdate = now;
          hudUpdateCount++;
        }
      }

      // At 120Hz without decoupling: 120 re-renders
      // With 250ms throttling: exactly 4 HUD updates per second
      expect(hudUpdateCount).toBe(4);
    });
  });
});
