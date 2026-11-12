// Broadphase correctness: the spatial hash must select exactly the same
// collision pairs as the original all-pairs scan, keep trigger orientation,
// and answer raycasts identically — while touching far fewer pairs at scale.

import { describe, expect, it, vi } from 'vitest';
import { CollisionDetector, PhysicsWorld, RigidBody, TriggerEvent } from '../src/engine/physics';
import type { CollisionManifold, RigidBodyOptions } from '../src/engine/physics/types';
import { ColliderUtils } from '../src/engine/physics/collider';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneSpecs(seed: number, count = 90): RigidBodyOptions[] {
  const rand = mulberry32(seed);
  const specs: RigidBodyOptions[] = [];
  for (let i = 0; i < count; i++) {
    const type = rand() < 0.55 ? 'static' : rand() < 0.8 ? 'dynamic' : 'kinematic';
    const shapeRoll = rand();
    const shape = shapeRoll < 0.4
      ? { type: 'box' as const, halfExtents: { x: 0.5 + rand() * 2, y: 0.5 + rand() * 2, z: 0.5 + rand() * 2 } }
      : shapeRoll < 0.75
        ? { type: 'sphere' as const, radius: 0.4 + rand() * 1.5 }
        : { type: 'cylinder' as const, radius: 0.5 + rand(), halfHeight: 0.5 + rand() * 2 };
    specs.push({
      id: `b${i}`, type, shape,
      position: { x: (rand() - 0.5) * 50, y: (rand() - 0.5) * 20, z: (rand() - 0.5) * 50 },
      velocity: { x: (rand() - 0.5) * 4, y: (rand() - 0.5) * 4, z: (rand() - 0.5) * 4 },
      isTrigger: rand() < 0.15
    });
  }
  return specs;
}

// The original O(n²) algorithm as a reference oracle.
function referenceStep(world: PhysicsWorld, specs: RigidBodyOptions[], dt: number, events: TriggerEvent[]): void {
  const bodies = specs.map(s => new RigidBody(s));
  bodies.forEach(b => world.addBody(b));
  const overlaps = new Set<string>();
  world.onTrigger(e => events.push(e));
  for (const b of bodies) b.integrateVelocity(dt, world.gravity);
  for (const b of bodies) b.integratePosition(dt);
  const manifolds: CollisionManifold[] = [];
  const current = new Set<string>();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (a.type !== 'dynamic' && b.type !== 'dynamic') continue;
      if (!ColliderUtils.testAABBOverlap(a.getAABB(), b.getAABB())) continue;
      const m = CollisionDetector.testCollision(a, b);
      if (!m) continue;
      if (a.isTrigger || b.isTrigger) {
        const trigger = a.isTrigger ? a : b;
        const visitor = a.isTrigger ? b : a;
        const key = `${trigger.id}__${visitor.id}`;
        current.add(key);
        events.push({ triggerBodyId: trigger.id, visitorBodyId: visitor.id, visitorPosition: visitor.position, type: overlaps.has(key) ? 'stay' : 'enter' });
        continue;
      }
      manifolds.push(m);
    }
  }
  const solve = (world as unknown as { solveManifolds(list: CollisionManifold[]): void }).solveManifolds.bind(world);
  solve(manifolds);
}

function snapshot(bodies: RigidBody[]) {
  return bodies.map(b => ({ id: b.id, p: { ...b.position }, v: { ...b.velocity } }));
}

const eventKeys = (events: TriggerEvent[]) =>
  events.map(e => `${e.type}:${e.triggerBodyId}:${e.visitorBodyId}`).sort();

describe('spatial-hash broadphase', () => {
  it.each([1, 7, 42])('matches brute-force pairs, state and triggers (seed %i)', (seed) => {
    const specs = sceneSpecs(seed);
    const world = new PhysicsWorld();
    const bodies = specs.map(s => new RigidBody(s));
    bodies.forEach(b => world.addBody(b));
    const events: TriggerEvent[] = [];
    world.onTrigger(e => events.push(e));
    const spy = vi.spyOn(CollisionDetector, 'testCollision');
    world.step(1 / 60);
    const actualPairs = spy.mock.calls.map(([a, b]) => `${a.id}|${b.id}`).sort();
    spy.mockRestore();

    const refWorld = new PhysicsWorld();
    const refEvents: TriggerEvent[] = [];
    const refSpy = vi.spyOn(CollisionDetector, 'testCollision');
    referenceStep(refWorld, specs, 1 / 60, refEvents);
    const expectedPairs = refSpy.mock.calls.map(([a, b]) => `${a.id}|${b.id}`).sort();
    refSpy.mockRestore();

    expect(actualPairs).toEqual(expectedPairs);
    const actual = snapshot(bodies);
    const expected = snapshot(refWorld.getAllBodies());
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].id).toBe(expected[i].id);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(actual[i].p[axis]).toBeCloseTo(expected[i].p[axis], 4);
        expect(actual[i].v[axis]).toBeCloseTo(expected[i].v[axis], 4);
      }
    }
    expect(eventKeys(events)).toEqual(eventKeys(refEvents));
  });

  it('touches a tiny fraction of pairs at scale', () => {
    const world = new PhysicsWorld();
    for (let i = 0; i < 1500; i++) {
      world.addBody(new RigidBody({
        id: `s${i}`, type: 'static',
        position: { x: (i % 50) * 30, y: 0, z: Math.floor(i / 50) * 30 },
        shape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 5 } }
      }));
    }
    for (let i = 0; i < 15; i++) {
      world.addBody(new RigidBody({
        id: `d${i}`, type: 'dynamic', position: { x: i * 60, y: 4, z: 0 },
        shape: { type: 'sphere', radius: 0.6 }
      }));
    }
    const spy = vi.spyOn(CollisionDetector, 'testCollision');
    world.step(1 / 60);
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBeLessThan(300); // Brute force would examine ~1.1M pairs.
  });

  it('raycasts identically to brute force, including after moves without a step', () => {
    const rand = mulberry32(99);
    const world = new PhysicsWorld();
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 120; i++) {
      const body = new RigidBody({
        id: `r${i}`, type: 'static',
        position: { x: (rand() - 0.5) * 80, y: (rand() - 0.5) * 30, z: (rand() - 0.5) * 80 },
        shape: rand() < 0.5
          ? { type: 'box', halfExtents: { x: 1 + rand() * 2, y: 1 + rand() * 2, z: 1 + rand() * 2 } }
          : { type: 'sphere', radius: 0.5 + rand() * 2 },
        isTrigger: rand() < 0.1
      });
      bodies.push(body);
      world.addBody(body);
    }
    for (let i = 0; i < 40; i++) {
      const origin = { x: (rand() - 0.5) * 60, y: (rand() - 0.5) * 20, z: (rand() - 0.5) * 60 };
      const direction = { x: rand() - 0.5, y: rand() - 0.5, z: rand() - 0.5 };
      const actual = world.raycast(origin, direction, 120);
      let expected = { hit: false, distance: 120, bodyId: null as string | null };
      for (const b of bodies) {
        if (b.isTrigger) continue;
        const hit = CollisionDetector.raycastBody(origin, direction, b, 120);
        if (hit.hit && hit.distance < expected.distance) expected = { hit: true, distance: hit.distance, bodyId: b.id };
      }
      expect(actual.hit).toBe(expected.hit);
      expect(actual.bodyId).toBe(expected.bodyId);
      expect(actual.distance).toBeCloseTo(expected.distance, 5);
    }
    bodies[0].setPosition(5, 5, 5);
    const moved = world.raycast({ x: 5, y: 20, z: 5 }, { x: 0, y: -1, z: 0 }, 50);
    expect(moved.hit).toBe(true);
    expect(moved.bodyId).toBe('r0');
  });

  it('handles oversized grounds and far negative coordinates', () => {
    const world = new PhysicsWorld();
    world.addBody(new RigidBody({
      id: 'mega', type: 'static', position: { x: -5000, y: 0, z: -5000 },
      shape: { type: 'box', halfExtents: { x: 200, y: 0.5, z: 200 } }
    }));
    const ball = new RigidBody({
      id: 'ball', type: 'dynamic', position: { x: -5010, y: 3, z: -4990 },
      shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 0, friction: 0.5 }
    });
    world.addBody(ball);
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(ball.position.y).toBeCloseTo(1.0, 1);
    const hit = world.raycast({ x: -5007, y: 10, z: -4990 }, { x: 0, y: -1, z: 0 }, 30);
    expect(hit.hit).toBe(true);
    expect(hit.bodyId).toBe('mega');
  });

  it('keeps lower-index trigger orientation when both bodies are triggers', () => {
    const world = new PhysicsWorld();
    world.addBody(new RigidBody({ id: 'first', type: 'static', isTrigger: true, position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 3 } }));
    world.addBody(new RigidBody({ id: 'second', type: 'dynamic', isTrigger: true, position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 1 } }));
    const events: TriggerEvent[] = [];
    world.onTrigger(e => events.push(e));
    world.step(1 / 60);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'enter', triggerBodyId: 'first', visitorBodyId: 'second' });
  });
});