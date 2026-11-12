// Regression suite for the physics upgrade: filtered ray queries, multi-probe
// ground detection, jump buffering, iterative contact solving, substepping, and
// oriented (rotated) box colliders.

import { describe, expect, it } from 'vitest';
import {
  CharacterPhysicsController,
  CollisionDetector,
  CollisionManifold,
  PhysicsWorld,
  RigidBody
} from '../src/engine/physics';

function flatWorld(gravityY = -18): PhysicsWorld {
  const world = new PhysicsWorld({ x: 0, y: gravityY, z: 0 });
  world.addBody(new RigidBody({
    id: 'floor',
    type: 'static',
    position: { x: 0, y: 0, z: 0 },
    shape: { type: 'box', halfExtents: { x: 30, y: 0.5, z: 30 } }
  }));
  return world;
}

function player(world: PhysicsWorld, x = 0, y = 1, z = 0) {
  const body = new RigidBody({
    id: 'player',
    type: 'dynamic',
    position: { x, y, z },
    shape: { type: 'sphere', radius: 0.5 },
    material: { friction: 0.4, restitution: 0 }
  });
  world.addBody(body);
  return { body, controller: new CharacterPhysicsController(body, world) };
}

describe('filtered ray queries', () => {
  it('skips the requested body instead of self-hitting', () => {
    const world = new PhysicsWorld({ x: 0, y: 0, z: 0 });
    const { body } = player(world, 0, 10, 0);
    const origin = { x: 0, y: body.position.y - 0.5 + 0.05, z: 0 };
    const down = { x: 0, y: -1, z: 0 };

    expect(world.raycast(origin, down, 5).bodyId).toBe('player');
    expect(world.raycast(origin, down, 5, { ignoreBodyId: 'player' }).hit).toBe(false);
  });

  it('still reports the floor when only the caster is ignored', () => {
    const world = flatWorld();
    const { body } = player(world);
    const origin = { x: 0, y: body.position.y - 0.5 + 0.05, z: 0 };
    const down = { x: 0, y: -1, z: 0 };

    expect(world.raycast(origin, down, 5).bodyId).toBe('floor');
    expect(world.raycast(origin, down, 5, { ignoreBodyId: 'player' }).bodyId).toBe('floor');
  });

  it('excludes triggers unless explicitly requested', () => {
    const world = flatWorld();
    world.addBody(new RigidBody({
      id: 'zone',
      type: 'static',
      isTrigger: true,
      position: { x: 0, y: 5, z: 0 },
      shape: { type: 'box', halfExtents: { x: 2, y: 1, z: 2 } }
    }));
    const ray = { x: 0, y: 20, z: 0 };
    const down = { x: 0, y: -1, z: 0 };

    expect(world.raycast(ray, down, 30).bodyId).toBe('floor');
    expect(world.raycast(ray, down, 30, { includeTriggers: true }).bodyId).toBe('zone');
  });
});

describe('ground detection', () => {
  it('reports grounded while hovering just above the surface', () => {
    const world = flatWorld();
    const { controller } = player(world, 0, 1.02, 0);
    controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
    expect(controller.getGrounded()).toBe(true);
  });

  it('keeps contact when only an edge probe overlaps the platform', () => {
    const world = new PhysicsWorld({ x: 0, y: -18, z: 0 });
    world.addBody(new RigidBody({
      id: 'ledge',
      type: 'static',
      position: { x: 0, y: 0, z: 0 },
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }
    }));
    const { controller } = player(world, 0.75, 1.0, 0);
    controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
    expect(controller.getGrounded()).toBe(true);
  });

  it('reports airborne with nothing underneath', () => {
    const world = new PhysicsWorld({ x: 0, y: -18, z: 0 });
    const { controller } = player(world, 0, 10, 0);
    controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
    expect(controller.getGrounded()).toBe(false);
  });

  it('snaps down small steps instead of going airborne', () => {
    const world = flatWorld();
    const { body, controller } = player(world, 0, 1.4, 0);
    controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
    expect(controller.getGrounded()).toBe(true);
    expect(body.position.y).toBeLessThan(1.4);
  });
});

describe('jump buffering', () => {
  it('fires a jump pressed shortly before landing', () => {
    const world = flatWorld();
    const { body, controller } = player(world, 0, 2.0, 0);
    body.setVelocity(0, -4, 0);

    // Fall until the landing frame is imminent, then press jump once.
    for (let i = 0; i < 60 && body.position.y > 1.15; i++) {
      controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
      world.step(1 / 60);
    }
    controller.update({ x: 0, y: 0 }, true, false, 1 / 60);

    for (let i = 0; i < 10; i++) {
      controller.update({ x: 0, y: 0 }, false, false, 1 / 60);
      world.step(1 / 60);
    }
    expect(body.velocity.y).toBeGreaterThan(0);
  });
});

describe('contact solver', () => {
  it('does not bounce impacts below the restitution threshold', () => {
    const world = new PhysicsWorld({ x: 0, y: 0, z: 0 });
    const a = new RigidBody({ id: 'a', type: 'dynamic', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0.1, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 1 } });
    const b = new RigidBody({ id: 'b', type: 'dynamic', position: { x: 0.9, y: 0, z: 0 }, velocity: { x: -0.1, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 1 } });
    world.addBody(a);
    world.addBody(b);
    world.step(1 / 60);

    expect(a.velocity.x).toBeLessThanOrEqual(0.1);
    expect(b.velocity.x).toBeGreaterThanOrEqual(-0.1);
  });

  it('still bounces fast impacts', () => {
    const world = new PhysicsWorld({ x: 0, y: 0, z: 0 });
    const a = new RigidBody({ id: 'a', type: 'dynamic', position: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 1 } });
    const b = new RigidBody({ id: 'b', type: 'dynamic', position: { x: 0.9, y: 0, z: 0 }, velocity: { x: -3, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { restitution: 1 } });
    world.addBody(a);
    world.addBody(b);
    world.step(1 / 60);

    expect(a.velocity.x).toBeLessThan(0);
    expect(b.velocity.x).toBeGreaterThan(0);
  });

  it('settles a two-box stack close to the ideal heights', () => {
    const world = flatWorld();
    const lower = new RigidBody({ id: 'lower', type: 'dynamic', position: { x: 0, y: 1.5, z: 0 }, shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });
    const upper = new RigidBody({ id: 'upper', type: 'dynamic', position: { x: 0, y: 2.5, z: 0 }, shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });
    world.addBody(lower);
    world.addBody(upper);
    for (let i = 0; i < 300; i++) world.step(1 / 60);

    expect(lower.position.y).toBeGreaterThan(0.985);
    expect(upper.position.y).toBeGreaterThan(1.975);
  });

  it('rests without jitter', () => {
    const world = flatWorld();
    const ball = new RigidBody({ id: 'ball', type: 'dynamic', position: { x: 0, y: 1, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
    world.addBody(ball);
    for (let i = 0; i < 120; i++) world.step(1 / 60);
    const settled = ball.position.y;
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(Math.abs(ball.position.y - settled)).toBeLessThan(0.002);
  });

  it('substeps fast bodies so thin floors are not tunnelled', () => {
    const world = new PhysicsWorld({ x: 0, y: -18, z: 0 });
    world.addBody(new RigidBody({ id: 'thin', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 10, y: 0.05, z: 10 } } }));
    const ball = new RigidBody({ id: 'ball', type: 'dynamic', position: { x: 0, y: 24, z: 0 }, velocity: { x: 0, y: -120, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
    world.addBody(ball);
    for (let i = 0; i < 180; i++) world.step(1 / 60);

    expect(ball.position.y).toBeGreaterThan(0);
    expect(ball.position.y).toBeLessThan(1.2);
  });
});

describe('triggers across substeps', () => {
  it('emits one enter, then stay, then exit', () => {
    const world = new PhysicsWorld({ x: 0, y: 0, z: 0 });
    world.addBody(new RigidBody({ id: 'zone', type: 'static', isTrigger: true, position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 2 } }));
    const visitor = new RigidBody({ id: 'visitor', type: 'dynamic', position: { x: 0, y: 0, z: 0 }, shape: { type: 'sphere', radius: 0.5 } });
    world.addBody(visitor);

    const events: string[] = [];
    world.onTrigger((e) => events.push(e.type));

    world.step(1 / 60);
    world.step(1 / 60);
    visitor.setPosition(50, 0, 0);
    world.step(1 / 60);

    expect(events).toEqual(['enter', 'stay', 'exit']);
  });
});

describe('oriented box colliders', () => {
  const rotated = (): RigidBody => new RigidBody({
    id: 'plate',
    type: 'static',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.PI / 4 },
    shape: { type: 'box', halfExtents: { x: 2, y: 0.2, z: 2 } }
  });

  it('expands the world AABB to cover the rotation', () => {
    const aabb = rotated().getAABB();
    expect(aabb.max.x).toBeCloseTo(2.2 * Math.SQRT1_2, 4);
    expect(aabb.max.y).toBeCloseTo(2.2 * Math.SQRT1_2, 4);
    expect(aabb.max.z).toBeCloseTo(2, 4);
  });

  it('raycasts against the tilted face normal', () => {
    const hit = CollisionDetector.raycastBody({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, rotated(), 20);
    expect(hit.hit).toBe(true);
    expect(hit.distance).toBeCloseTo(5 - 0.2 * Math.SQRT2, 3);
    expect(hit.normal.x).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(hit.normal.y).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('detects a sphere touching the tilted face', () => {
    const sphere = new RigidBody({ id: 's', type: 'dynamic', position: { x: -0.45 * Math.SQRT1_2, y: 0.45 * Math.SQRT1_2, z: 0 }, shape: { type: 'sphere', radius: 0.3 } });
    const manifold = CollisionDetector.testCollision(sphere, rotated());
    expect(manifold).not.toBeNull();
    expect(manifold?.depth).toBeCloseTo(0.05, 2);
  });

  it('uses SAT for rotated box pairs', () => {
    const wall = new RigidBody({ id: 'w', type: 'static', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 4, z: 0 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 3 } } });
    const box = new RigidBody({ id: 'b', type: 'dynamic', position: { x: 0, y: 1.4, z: 0 }, shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } });
    const manifold = CollisionDetector.testCollision(wall, box);
    expect(manifold).not.toBeNull();
    expect(manifold?.normal.y).toBeCloseTo(1, 5);
    expect(manifold?.normal.x).toBeCloseTo(0, 5);
    expect(manifold?.depth).toBeCloseTo(0.1, 3);
  });

  it('keeps axis-aligned pairs on the fast path', () => {
    const a = new RigidBody({ id: 'a', type: 'static', position: { x: 0, y: 0, z: 0 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
    const b = new RigidBody({ id: 'b', type: 'dynamic', position: { x: 0, y: 1.8, z: 0 }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } } });
    expect(a.isOriented).toBe(false);
    const manifold: CollisionManifold | null = CollisionDetector.testCollision(a, b);
    expect(manifold?.depth).toBeCloseTo(0.2, 3);
  });

  it('stops a sphere that walks into a rotated wall', () => {
    const world = flatWorld();
    world.addBody(new RigidBody({
      id: 'wall',
      type: 'static',
      position: { x: 3, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0.3 },
      shape: { type: 'box', halfExtents: { x: 0.2, y: 3, z: 4 } }
    }));
    const ball = new RigidBody({ id: 'ball', type: 'dynamic', position: { x: 0, y: 1, z: 0 }, shape: { type: 'sphere', radius: 0.5 }, material: { friction: 0.4, restitution: 0 } });
    world.addBody(ball);
    for (let i = 0; i < 60; i++) {
      ball.velocity.x = 6;
      world.step(1 / 60);
    }
    // Unblocked travel would be 6 m; the leaning wall face starts near x = 1.9.
    expect(ball.position.x).toBeLessThan(2.6);
    expect(ball.position.x).toBeGreaterThan(1.5);
  });
});
