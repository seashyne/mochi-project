// Steering behaviours: seek/arrive velocity shaping, separation from neighbours
// and blocked-lane avoidance, plus the arrival ramp inside the player navigator.

import { describe, it, expect } from 'vitest';
import {
  arrive,
  avoidBlocked,
  clampSpeed,
  distance2d,
  seek,
  separation,
  type SteeringAgent
} from '../src/engine/navigation/steering';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { PlayerNavigator } from '../src/engine/runtime/playerNavigator';
import type { RuntimePlayerHandle, RuntimeVec3 } from '../src/engine/runtime/types';

class RecordingPlayer implements RuntimePlayerHandle {
  readonly id = 'p';
  readonly name = 'P';
  position: RuntimeVec3;
  velocity: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  health = 100;
  respawns = 0;
  constructor(x: number, z: number) { this.position = { x, y: 0, z }; }
  getPosition(): RuntimeVec3 { return this.position; }
  setPosition(x: number, y: number, z: number): void { this.position = { x, y, z }; }
  setVelocity(): void { /* unused */ }
  applyImpulse(): void { /* unused */ }
  respawn(): void { this.respawns += 1; }
  damage(n: number): void { this.health -= n; }
  heal(n: number): void { this.health += n; }
  getHealth(): number { return this.health; }
  getMaxHealth(): number { return 100; }
}

describe('seek', () => {
  it('returns a unit-length velocity at max speed', () => {
    const velocity = seek({ x: 0, z: 0 }, { x: 3, z: 4 }, 5);
    expect(velocity).toEqual({ x: 3, z: 4 });
  });

  it('returns zero when already there', () => {
    expect(seek({ x: 1, z: 1 }, { x: 1, z: 1 }, 5)).toEqual({ x: 0, z: 0 });
  });

  it('tolerates a non-positive max speed', () => {
    expect(seek({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('arrive', () => {
  it('runs at full speed outside the slowdown radius', () => {
    const velocity = arrive({ x: 0, z: 0 }, { x: 10, z: 0 }, 4, 2);
    expect(velocity).toEqual({ x: 4, z: 0 });
  });

  it('scales down inside the slowdown radius', () => {
    const velocity = arrive({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, 2);
    expect(velocity.x).toBeCloseTo(2, 5);
    expect(velocity.z).toBe(0);
  });

  it('reaches zero exactly at the target', () => {
    expect(arrive({ x: 5, z: 5 }, { x: 5, z: 5 }, 4, 2)).toEqual({ x: 0, z: 0 });
  });
});

describe('separation', () => {
  const agent: SteeringAgent = {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    maxSpeed: 4,
    radius: 0.5
  };

  it('pushes away from an overlapping neighbour', () => {
    const push = separation(agent, [{ position: { x: 0.2, z: 0 }, radius: 0.5 }]);
    expect(push.x).toBeLessThan(0);
    expect(push.z).toBe(0);
    expect(Math.hypot(push.x, push.z)).toBeCloseTo(4, 5);
  });

  it('is stronger the closer the neighbour is', () => {
    const near = separation(agent, [{ position: { x: 0.1, z: 0 }, radius: 0.5 }], 2);
    const far = separation(agent, [{ position: { x: 0.8, z: 0 }, radius: 0.5 }], 2);
    expect(Math.hypot(near.x, near.z)).toBeGreaterThan(Math.hypot(far.x, far.z));
  });

  it('stays zero when nobody overlaps', () => {
    expect(separation(agent, [{ position: { x: 5, z: 0 }, radius: 0.5 }])).toEqual({ x: 0, z: 0 });
    expect(separation(agent, [])).toEqual({ x: 0, z: 0 });
  });

  it('never pushes past max speed however many neighbours pile on', () => {
    const crowd = [
      { position: { x: 0.2, z: 0 }, radius: 0.5 },
      { position: { x: -0.2, z: 0.1 }, radius: 0.5 },
      { position: { x: 0.1, z: -0.2 }, radius: 0.5 }
    ];
    const push = separation(agent, crowd);
    expect(Math.hypot(push.x, push.z)).toBeLessThanOrEqual(agent.maxSpeed + 1e-9);
  });

  it('points away from the middle of a crowd', () => {
    // One neighbour behind, none in front: the escape route is forward.
    const push = separation(agent, [{ position: { x: 0, z: 0.4 }, radius: 0.5 }]);
    expect(push.z).toBeLessThan(0);
  });
});

describe('avoidBlocked', () => {
  // 5 m of 1 m cells centred on the origin, column x = 3 blocked. Note that
  // fromPredicate takes the origin corner itself, not a NavGridOptions object:
  // passing `{ origin: ... }` silently anchors the grid at 0,0 instead.
  const grid = NavGrid.fromPredicate(5, 5, 1, (x) => x !== 3, { x: -2.5, z: -2.5 });

  it('stays zero on a clear lane', () => {
    expect(avoidBlocked(grid, { x: 0, z: -2 }, { x: 0, z: 1 }, 2)).toEqual({ x: 0, z: 0 });
  });

  it('nudges sideways before a wall', () => {
    const nudge = avoidBlocked(grid, { x: 0, z: 0 }, { x: 1, z: 0 }, 2);
    expect(nudge.z).not.toBe(0);
    expect(nudge.x).toBeCloseTo(0, 5);
  });

  it('takes the free side when the other one is blocked', () => {
    // Same wall ahead, plus the cell on its left, so the only escape is right.
    const oneSided = NavGrid.fromPredicate(5, 5, 1, (x, y) => x !== 3 && !(x === 2 && y >= 3), {
      x: -2.5,
      z: -2.5
    });
    const nudge = avoidBlocked(oneSided, { x: 0, z: 0 }, { x: 1, z: 0 }, 2);
    expect(nudge.z).toBeLessThan(0);
    expect(nudge.x).toBeCloseTo(0, 5);
  });

  it('is inert when boxed in on both sides', () => {
    const boxed = NavGrid.fromPredicate(5, 5, 1, (x, y) => x !== 3 && !(x === 2 && (y === 1 || y === 3)), {
      x: -2.5,
      z: -2.5
    });
    expect(avoidBlocked(boxed, { x: 0, z: 0 }, { x: 1, z: 0 }, 2)).toEqual({ x: 0, z: 0 });
  });

  it('is inert when standing still', () => {
    expect(avoidBlocked(grid, { x: 0, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  });
});

describe('clampSpeed', () => {
  it('leaves a slow vector alone and clamps a fast one', () => {
    expect(clampSpeed({ x: 1, z: 0 }, 5)).toEqual({ x: 1, z: 0 });
    const clamped = clampSpeed({ x: 6, z: 0 }, 5);
    expect(Math.hypot(clamped.x, clamped.z)).toBeCloseTo(5, 6);
    expect(clampSpeed({ x: 0, z: 0 }, 5)).toEqual({ x: 0, z: 0 });
  });
});

describe('navigator arrival', () => {
  it('decelerates into the final waypoint instead of stopping dead', () => {
    const player = new RecordingPlayer(0, 0);
    const navigator = new PlayerNavigator(player);
    navigator.begin([{ x: 6, z: 0 }]);

    const deltas: number[] = [];
    let previous = 0;
    for (let tick = 0; tick < 60 && navigator.isActive; tick += 1) {
      navigator.update(0.05);
      deltas.push(player.position.x - previous);
      previous = player.position.x;
    }

    expect(navigator.isActive).toBe(false);
    expect(player.position.x).toBeCloseTo(6, 5);
    // The step size shrank on the way in.
    const firstHalf = deltas.slice(0, Math.floor(deltas.length / 2));
    const lastHalf = deltas.slice(Math.floor(deltas.length / 2));
    const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
    expect(average(firstHalf)).toBeGreaterThan(average(lastHalf));
  });
});

describe('distance2d', () => {
  it('measures plain planar distance', () => {
    expect(distance2d({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo(5, 6);
  });
});
