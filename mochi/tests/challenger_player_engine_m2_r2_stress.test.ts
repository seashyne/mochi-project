// Adversarial Stress Harness: Milestone 2 Iteration 2 (Player 3D Engine & Controls)
// Empirical validation: Character physics, Follow camera, Touch joystick & Resource disposal

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  CharacterPhysicsController,
  PhysicsWorld,
  RigidBody,
  computeCameraRelativeVelocity
} from '../src/engine/physics';
import { FollowCamera } from '../src/engine/camera/followCamera';
import { buildHumanoidAvatar } from '../src/engine/avatar/avatarBuilder';
import { loadWorldFromManifest } from '../src/engine/scene/sceneLoader';
import { StudioObject } from '../src/engine/studio/types';

describe('Milestone 2 Iteration 2: Empirical Player Engine Stress Harness', () => {
  // Area 1: Character Physics Controller
  describe('Area 1: Character Physics Controller & Raycasting Stress', () => {
    it('detects ground contact on static platform when vy <= 0.1 and rejects when ascending', () => {
      const world = new PhysicsWorld({ x: 0, y: -18.0, z: 0 });
      const floor = new RigidBody({ id: 'floor_main', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } });
      world.addBody(floor);
      const playerBody = new RigidBody({ id: 'p_test', type: 'dynamic', position: { x: 0, y: 1.1, z: 0 }, shape: { type: 'sphere', radius: 0.6 } });
      world.addBody(playerBody);
      const ctrl = new CharacterPhysicsController(playerBody, world);

      // Settle on platform via physics steps (vy = 0 <= 0.1) -> Grounded
      for (let i = 0; i < 10; i++) {
        world.step(0.016);
        ctrl.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      }
      expect(ctrl.getGrounded()).toBe(true);

      // Ascending from jump (vy = 8.0 > 0.1) -> Ungrounded even if within raycast range
      playerBody.velocity.y = 8.0;
      ctrl.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      expect(ctrl.getGrounded()).toBe(false);
    });

    it('ignores trigger bodies in ground raycast detection', () => {
      const world = new PhysicsWorld({ x: 0, y: -18.0, z: 0 });
      const triggerCoin = new RigidBody({ id: 'trig', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } }, isTrigger: true });
      world.addBody(triggerCoin);
      const playerBody = new RigidBody({ id: 'p_air', type: 'dynamic', position: { x: 0, y: 1.1, z: 0 }, shape: { type: 'sphere', radius: 0.6 } });
      world.addBody(playerBody);
      const ctrl = new CharacterPhysicsController(playerBody, world);

      ctrl.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      expect(ctrl.getGrounded()).toBe(false);
    });

    it('buffers jumps via coyote time after stepping off a platform edge', () => {
      const world = new PhysicsWorld({ x: 0, y: -18.0, z: 0 });
      const platform = new RigidBody({ id: 'plat', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 2, y: 0.5, z: 2 } } });
      world.addBody(platform);
      const player = new RigidBody({ id: 'p_coyote', type: 'dynamic', position: { x: 0, y: 1.1, z: 0 }, shape: { type: 'sphere', radius: 0.6 } });
      world.addBody(player);
      const ctrl = new CharacterPhysicsController(player, world, { coyoteDurationSec: 0.12 });

      for (let i = 0; i < 10; i++) {
        world.step(0.016);
        ctrl.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      }
      expect(ctrl.getGrounded()).toBe(true);

      // Walk off ledge into empty air
      player.position.x = 50.0;
      ctrl.update({ x: 0, y: 0 }, false, false, 0.04, 0);
      expect(ctrl.getGrounded()).toBe(false);

      // Within coyote time (0.04s < 0.12s), jump succeeds
      ctrl.update({ x: 0, y: 0 }, true, false, 0.016, 0);
      expect(player.velocity.y).toBe(9.0);

      // After jump, coyote time is consumed
      player.velocity.y = 0;
      ctrl.update({ x: 0, y: 0 }, true, false, 0.15, 0);
      expect(player.velocity.y).toBe(0);
    });

    it('inherits horizontal velocity from moving kinematic platforms', () => {
      const world = new PhysicsWorld();
      const mover = new RigidBody({ id: 'm_plat', type: 'kinematic', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 5 } } });
      mover.velocity.x = 4.0;
      mover.velocity.z = -2.5;
      world.addBody(mover);
      const player = new RigidBody({ id: 'rider', type: 'dynamic', position: { x: 0, y: 1.1, z: 0 }, shape: { type: 'sphere', radius: 0.6 } });
      world.addBody(player);
      const ctrl = new CharacterPhysicsController(player, world);

      for (let i = 0; i < 10; i++) {
        world.step(0.016);
        ctrl.update({ x: 0, y: 0 }, false, false, 0.016, 0);
      }
      expect(ctrl.getGrounded()).toBe(true);

      const startX = player.position.x;
      const startZ = player.position.z;
      const dt = 0.05;
      ctrl.update({ x: 0, y: 0 }, false, false, dt, 0);

      expect(player.position.x).toBeCloseTo(startX + 4.0 * dt, 4);
      expect(player.position.z).toBeCloseTo(startZ + -2.5 * dt, 4);
    });

    it('strictly normalizes diagonal velocities to 6.0 (walk) and 9.6 (sprint)', () => {
      const yawAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const yaw of yawAngles) {
        const walkVel = computeCameraRelativeVelocity({ forward: 1, strafe: 1 }, yaw, 6.0);
        expect(Math.hypot(walkVel.vx, walkVel.vz)).toBeCloseTo(6.0, 4);
        const sprintVel = computeCameraRelativeVelocity({ forward: 1, strafe: 1 }, yaw, 9.6);
        expect(Math.hypot(sprintVel.vx, sprintVel.vz)).toBeCloseTo(9.6, 4);
      }
    });
  });

  // Area 2: Follow Camera Spherical Orbit & Singularity Avoidance
  describe('Area 2: Follow Camera Spherical Orbit & Singularity Avoidance', () => {
    it('clamps pitch strictly between 0.1 rad and 1.5208 rad across extreme mouse deltas', () => {
      const cam = new FollowCamera();
      cam.orbit(0, -999999);
      expect(cam.getPitch()).toBe(cam.minPhi);
      expect(cam.getPitch()).toBeCloseTo(0.1, 4);

      cam.orbit(0, 999999);
      expect(cam.getPitch()).toBe(cam.maxPhi);
      expect(cam.getPitch()).toBeCloseTo(Math.PI / 2 - 0.05, 4);
      expect(cam.getPitch()).toBeLessThanOrEqual(1.5208);
    });

    it('prevents singularity at minimum pitch and computes valid, non-NaN world matrices', () => {
      const cam = new FollowCamera();
      const threeCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
      cam.orbit(0, -999999); // Clamped to minPhi (0.1 rad)
      cam.update(threeCam, 0.016);
      threeCam.updateMatrixWorld(true);

      const elements = threeCam.matrixWorld.elements;
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(elements[i])).toBe(true);
        expect(Number.isNaN(elements[i])).toBe(false);
      }

      const fwd = cam.getForwardVector();
      const right = cam.getRightVector();
      expect(fwd.length()).toBeCloseTo(1.0, 4);
      expect(right.length()).toBeCloseTo(1.0, 4);
      expect(fwd.dot(right)).toBeCloseTo(0, 4);
    });

    it('maintains camera altitude strictly above character target plane at max pitch', () => {
      const cam = new FollowCamera({ target: { x: 0, y: 5.0, z: 0 }, radius: 8.0 });
      const threeCam = new THREE.PerspectiveCamera();
      cam.orbit(0, 999999); // maxPhi
      cam.update(threeCam, 0.016);

      expect(cam.currentPosition.y).toBeGreaterThan(cam.target.y);
      expect(Number.isFinite(cam.currentPosition.x)).toBe(true);
      expect(Number.isFinite(cam.currentPosition.z)).toBe(true);
    });
  });

  // Area 3: Multi-Device Touch Joystick Math & Isolation
  describe('Area 3: Multi-Device Touch Joystick Mathematical Properties', () => {
    function simulateJoystickMove(deltaX: number, deltaY: number, maxRadius = 50, deadzone = 0.1) {
      const dist = Math.hypot(deltaX, deltaY);
      if (dist === 0 || maxRadius <= 0) return { outX: 0, outY: 0, clampedDist: 0 };
      const clamped = Math.min(dist, maxRadius);
      const norm = clamped / maxRadius;
      if (norm < deadzone) return { outX: 0, outY: 0, clampedDist: clamped };
      return { outX: (deltaX / dist) * norm, outY: -(deltaY / dist) * norm, clampedDist: clamped };
    }

    it('strictly outputs (0, 0) inside the deadzone boundary (< 5px for r=50)', () => {
      expect(simulateJoystickMove(0, 0)).toEqual({ outX: 0, outY: 0, clampedDist: 0 });
      expect(simulateJoystickMove(3, 3)).toEqual({ outX: 0, outY: 0, clampedDist: Math.hypot(3, 3) });
      expect(simulateJoystickMove(0, -4.9)).toEqual({ outX: 0, outY: 0, clampedDist: 4.9 });
    });

    it('inverts screen Y axis so drag-up (negative deltaY) maps to positive forward output', () => {
      const dragUp = simulateJoystickMove(0, -30);
      expect(dragUp.outY).toBeGreaterThan(0);
      expect(dragUp.outY).toBeCloseTo(0.6, 4);

      const dragDown = simulateJoystickMove(0, 30);
      expect(dragDown.outY).toBeLessThan(0);
      expect(dragDown.outY).toBeCloseTo(-0.6, 4);
    });

    it('clamps output magnitude strictly to 1.0 under massive touch excursions', () => {
      const hugeDrag = simulateJoystickMove(5000, 5000);
      expect(Math.hypot(hugeDrag.outX, hugeDrag.outY)).toBeCloseTo(1.0, 4);
      expect(hugeDrag.clampedDist).toBe(50);
    });

    it('isolates primary active touch and rejects secondary touch interference', () => {
      let activeTouchId: number | null = null;
      let activeOutput = { x: 0, y: 0 };

      const onTouchStart = (id: number) => { if (activeTouchId === null) activeTouchId = id; };
      const onTouchMove = (touches: { id: number; dx: number; dy: number }[]) => {
        const cur = touches.find((t) => t.id === activeTouchId);
        if (cur) {
          const res = simulateJoystickMove(cur.dx, cur.dy);
          activeOutput = { x: res.outX, y: res.outY };
        }
      };
      const onTouchEnd = (touches: { id: number }[]) => {
        if (touches.some((t) => t.id === activeTouchId)) {
          activeTouchId = null;
          activeOutput = { x: 0, y: 0 };
        }
      };

      onTouchStart(101);
      expect(activeTouchId).toBe(101);
      onTouchStart(102); // Secondary touch ignored
      expect(activeTouchId).toBe(101);
      onTouchMove([{ id: 102, dx: 40, dy: -40 }]);
      expect(activeOutput).toEqual({ x: 0, y: 0 });
      onTouchMove([{ id: 101, dx: 0, dy: -50 }]);
      expect(activeOutput.y).toBeCloseTo(1.0, 4);
      onTouchEnd([{ id: 102 }]); // Touch 2 end
      expect(activeTouchId).toBe(101);
      onTouchEnd([{ id: 101 }]); // Touch 1 end
      expect(activeTouchId).toBeNull();
      expect(activeOutput).toEqual({ x: 0, y: 0 });
    });
  });

  // Area 4: Resource Disposal and Memory Leak Prevention
  describe('Area 4: Resource Disposal & Memory Leak Prevention', () => {
    it('disposes all Three.js meshes, materials, and physics bodies in complex scenes', () => {
      const scene = new THREE.Scene();
      const world = new PhysicsWorld();
      const geomSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
      const matSpy = vi.spyOn(THREE.Material.prototype, 'dispose');

      const objects: StudioObject[] = Array.from({ length: 25 }, (_, i) => ({
        id: `stress_${i}`,
        name: `Obj ${i}`,
        type: i % 3 === 0 ? 'platform' : i % 3 === 1 ? 'jump_pad' : 'coin',
        position: { x: i * 2, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#6366f1'
      }));

      const result = loadWorldFromManifest(scene, { objects }, world);
      // 9 platforms, 8 coins, and 8 jump pads collapse into four batches (box, coin, pad base, pad ring).
      expect(scene.children.length).toBe(4);
      expect(scene.getObjectByName('instances_box')).toBeDefined();
      expect(scene.getObjectByName('instances_coin')).toBeDefined();
      expect(scene.getObjectByName('instances_jump_pad_base')).toBeDefined();
      expect(scene.getObjectByName('instances_jump_pad_ring')).toBeDefined();
      expect(world.getAllBodies().length).toBe(25);

      result.dispose();
      expect(scene.children.length).toBe(0);
      expect(world.getAllBodies().length).toBe(0);
      expect(geomSpy).toHaveBeenCalled();
      expect(matSpy).toHaveBeenCalled();

      geomSpy.mockRestore();
      matSpy.mockRestore();
    });

    it('cleans up humanoid avatar rig geometries and materials on dispose', () => {
      const geomSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
      const matSpy = vi.spyOn(THREE.Material.prototype, 'dispose');

      const avatar = buildHumanoidAvatar();
      expect(avatar.root.children.length).toBeGreaterThan(0);

      avatar.dispose();
      expect(avatar.root.children.length).toBe(0);
      expect(geomSpy).toHaveBeenCalled();
      expect(matSpy).toHaveBeenCalled();

      geomSpy.mockRestore();
      matSpy.mockRestore();
    });
  });
});
