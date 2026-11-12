// Unit and integration test suite for 3D Physics Engine Subsystem
// Verifies vector math, collision detection, rigid body dynamics, character controller, and triggers

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Vec3Math,
  ColliderUtils,
  RigidBody,
  CollisionDetector,
  PhysicsWorld,
  CharacterPhysicsController,
  TriggerEvent
} from '../src/engine/physics';

describe('3D Physics Engine Subsystem', () => {
  describe('Vec3Math Operations', () => {
    it('performs basic vector arithmetic correctly', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      expect(Vec3Math.add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
      expect(Vec3Math.subtract(b, a)).toEqual({ x: 3, y: 3, z: 3 });
      expect(Vec3Math.scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
      expect(Vec3Math.dot(a, b)).toBe(32);
      expect(Vec3Math.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('calculates length, normalization, distance, lerp, and clamping', () => {
      const v = { x: 0, y: 3, z: 4 };
      expect(Vec3Math.length(v)).toBe(5);
      const norm = Vec3Math.normalize(v);
      expect(norm.x).toBe(0);
      expect(norm.y).toBeCloseTo(0.6, 5);
      expect(norm.z).toBeCloseTo(0.8, 5);
      expect(Vec3Math.distance({ x: 0, y: 0, z: 0 }, v)).toBe(5);
      expect(Vec3Math.lerp({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
      expect(Vec3Math.clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('Colliders and AABB Bounding Calculation', () => {
    it('computes correct AABB for box and sphere', () => {
      const boxAabb = ColliderUtils.computeAABB({ type: 'box', halfExtents: { x: 2, y: 1, z: 3 } }, { x: 5, y: 5, z: 5 });
      expect(boxAabb.min).toEqual({ x: 3, y: 4, z: 2 });
      expect(boxAabb.max).toEqual({ x: 7, y: 6, z: 8 });

      const sphereAabb = ColliderUtils.computeAABB({ type: 'sphere', radius: 1.5 }, { x: 0, y: 0, z: 0 });
      expect(sphereAabb.min).toEqual({ x: -1.5, y: -1.5, z: -1.5 });
      expect(sphereAabb.max).toEqual({ x: 1.5, y: 1.5, z: 1.5 });
    });

    it('tests AABB overlap accurately', () => {
      const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
      const b = { min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 3, z: 3 } };
      const c = { min: { x: 5, y: 5, z: 5 }, max: { x: 6, y: 6, z: 6 } };
      expect(ColliderUtils.testAABBOverlap(a, b)).toBe(true);
      expect(ColliderUtils.testAABBOverlap(a, c)).toBe(false);
    });
  });

  describe('RigidBody Dynamics and Semi-Implicit Euler Integration', () => {
    it('initializes dynamic and static bodies with correct inverse mass', () => {
      const dyn = new RigidBody({ type: 'dynamic', mass: 2.0, shape: { type: 'sphere', radius: 1 } });
      expect(dyn.mass).toBe(2.0);
      expect(dyn.invMass).toBe(0.5);

      const st = new RigidBody({ type: 'static', shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
      expect(st.mass).toBe(Infinity);
      expect(st.invMass).toBe(0);
    });

    it('applies impulses and integrates gravity velocity', () => {
      const body = new RigidBody({ type: 'dynamic', mass: 1.0, shape: { type: 'sphere', radius: 0.5 } });
      body.applyImpulse({ x: 5, y: 0, z: 0 });
      expect(body.velocity.x).toBe(5);
      body.integrateVelocity(0.1, { x: 0, y: -10, z: 0 });
      expect(body.velocity.y).toBeCloseTo(-1.0, 2);
    });
  });

  describe('Collision Detection and Contact Manifolds', () => {
    it('detects sphere-sphere collision and computes normal and depth', () => {
      const s1 = new RigidBody({ type: 'dynamic', position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 1.0 } });
      const s2 = new RigidBody({ type: 'dynamic', position: { x: 1.5, y: 0, z: 0 }, shape: { type: 'sphere', radius: 1.0 } });
      const manifold = CollisionDetector.testSphereSphere(s1, s2);
      expect(manifold).not.toBeNull();
      expect(manifold?.depth).toBeCloseTo(0.5, 3);
      expect(manifold?.normal.x).toBeCloseTo(1.0, 3);
    });

    it('detects box-box penetration along minimum overlap axis', () => {
      const b1 = new RigidBody({ type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
      const b2 = new RigidBody({ type: 'dynamic', position: { x: 0, y: 1.8, z: 0 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
      const manifold = CollisionDetector.testBoxBox(b1, b2);
      expect(manifold).not.toBeNull();
      expect(manifold?.normal).toEqual({ x: 0, y: 1, z: 0 });
      expect(manifold?.depth).toBeCloseTo(0.2, 3);
    });

    it('detects sphere-box contact correctly', () => {
      const sphere = new RigidBody({ type: 'dynamic', position: { x: 0, y: 1.4, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
      const box = new RigidBody({ type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 2, y: 1, z: 2 } } });
      const manifold = CollisionDetector.testSphereBox(sphere, box, false);
      expect(manifold).not.toBeNull();
      expect(manifold?.depth).toBeCloseTo(0.1, 2);
    });
  });

  describe('Raycasting Queries', () => {
    it('hits sphere with raycast and computes distance and point', () => {
      const sphere = new RigidBody({ type: 'static', position: { x: 0, y: 0, z: 10 }, shape: { type: 'sphere', radius: 2 } });
      const hit = CollisionDetector.raycastBody({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, sphere, 50);
      expect(hit.hit).toBe(true);
      expect(hit.distance).toBeCloseTo(8.0, 2);
    });

    it('hits box with raycast and returns correct face normal', () => {
      const box = new RigidBody({ type: 'static', position: { x: 0, y: 0, z: 5 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
      const hit = CollisionDetector.raycastBody({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, box, 20);
      expect(hit.hit).toBe(true);
      expect(hit.distance).toBeCloseTo(4.0, 2);
      expect(hit.normal.z).toBeCloseTo(-1, 2);
    });
  });

  describe('PhysicsWorld Simulation & Collision Resolution', () => {
    let world: PhysicsWorld;
    beforeEach(() => {
      world = new PhysicsWorld({ x: 0, y: -9.8, z: 0 });
    });

    it('simulates falling ball landing on static ground box', () => {
      const ground = new RigidBody({ id: 'ground', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } });
      const ball = new RigidBody({ id: 'ball', type: 'dynamic', position: { x: 0, y: 2.0, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 0.0, friction: 0.5 } });
      world.addBody(ground);
      world.addBody(ball);

      for (let i = 0; i < 30; i++) world.step(1 / 60);
      expect(ball.position.y).toBeCloseTo(1.0, 1);
    });

    it('dispatches trigger enter and exit events', () => {
      const events: TriggerEvent[] = [];
      world.onTrigger((e) => events.push(e));
      const trigger = new RigidBody({ id: 'coin_trigger', type: 'static', isTrigger: true, position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 2.0 } });
      const visitor = new RigidBody({ id: 'player_visitor', type: 'dynamic', position: { x: 10, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
      world.addBody(trigger);
      world.addBody(visitor);

      world.step(1 / 60);
      expect(events).toHaveLength(0);

      visitor.setPosition(0, 0, 0);
      world.step(1 / 60);
      expect(events.some((e) => e.type === 'enter')).toBe(true);

      visitor.setPosition(20, 0, 0);
      world.step(1 / 60);
      expect(events.some((e) => e.type === 'exit')).toBe(true);
    });
  });

  describe('CharacterPhysicsController Mechanics', () => {
    let world: PhysicsWorld;
    let playerBody: RigidBody;
    let controller: CharacterPhysicsController;

    beforeEach(() => {
      world = new PhysicsWorld({ x: 0, y: -18.0, z: 0 });
      const ground = new RigidBody({ id: 'floor', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 20, y: 0.5, z: 20 } } });
      world.addBody(ground);
      playerBody = new RigidBody({ id: 'char_player', type: 'dynamic', position: { x: 0, y: 1.0, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
      world.addBody(playerBody);
      controller = new CharacterPhysicsController(playerBody, world, { walkSpeed: 6.0, jumpVelocity: 10.0 });
    });

    it('moves horizontally with input and stops with ground friction', () => {
      world.step(1 / 60);
      controller.update({ x: 1, y: 0 }, false, false, 1 / 60);
      expect(playerBody.velocity.x).toBeGreaterThan(0);

      for (let i = 0; i < 20; i++) controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
      expect(playerBody.velocity.x).toBeCloseTo(0, 1);
    });

    it('executes jump and applies jump pad impulse', () => {
      world.step(1 / 60);
      controller.update({ x: 0, y: 0 }, true, false, 1 / 60);
      expect(playerBody.velocity.y).toBeCloseTo(10.0, 1);

      controller.applyJumpPadImpulse(18.0);
      expect(playerBody.velocity.y).toBe(18.0);
    });

    it('respawns player cleanly to spawn point', () => {
      controller.setSpawnPoint({ x: 5, y: 2, z: 5 });
      playerBody.setPosition(100, -50, 100);
      controller.respawn();
      expect(playerBody.position.x).toBe(5);
      expect(playerBody.position.y).toBeCloseTo(2.5, 1);
      expect(playerBody.velocity).toEqual({ x: 0, y: 0, z: 0 });
    });
  });
});
