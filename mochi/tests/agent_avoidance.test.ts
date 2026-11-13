// Local avoidance: the kernel resolver, its parity with the TypeScript reference,
// and the property that matters in play - agents never share the same space.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics } from '../src/engine/physics/wasmPhysics';
import {
  resolveOverlaps,
  resolveOverlapsTypeScript,
  type OverlapBody
} from '../src/engine/navigation/localAvoidance';
import { createRuntimeAgents, type AgentBody } from '../src/engine/runtime/runtimeAgents';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { OBJECT_TYPE_DEFAULTS, type StudioObject } from '../src/engine/studio/types';

class FakeAgent implements AgentBody {
  readonly id: string;
  position: { x: number; y: number; z: number };

  constructor(id: string, x: number, z: number) {
    this.id = id;
    this.position = { x, y: 1, z };
  }

  getPosition() {
    return this.position;
  }

  setPosition(x: number, y: number, z: number) {
    this.position = { x, y, z };
  }
}

const openGrid = () => NavGrid.fromPredicate(24, 24, 1, () => true, { x: -12, z: -12 });

function agentObject(id: string, x: number, z: number): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS.agent;
  return {
    id,
    name: id,
    type: 'agent',
    position: { x, y: 1, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { ...defaults.defaultScale },
    color: defaults.defaultColor,
    luaScript: ''
  };
}

const overlapping = (): OverlapBody[] => [
  { x: 0, z: 0, radius: 0.45, weight: 1 },
  { x: 0.5, z: 0.1, radius: 0.45, weight: 1 },
  { x: 0.2, z: 0.6, radius: 0.5, weight: 0 }
];

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
});

describe('resolveOverlaps', () => {
  it('matches the TypeScript reference', () => {
    const fromKernel = overlapping();
    const fromTypeScript = overlapping();

    const kernelMoves = resolveOverlaps(fromKernel);
    const referenceMoves = resolveOverlapsTypeScript(fromTypeScript, 0.25, 4);

    // The move count is not part of the contract: f32 and f64 disagree about
    // whether a residual overlap is still positive, so the passes can differ. The
    // resulting positions are what callers see.
    expect(kernelMoves).toBeGreaterThan(0);
    expect(referenceMoves).toBeGreaterThan(0);
    fromKernel.forEach((body, index) => {
      expect(body.x).toBeCloseTo(fromTypeScript[index].x, 3);
      expect(body.z).toBeCloseTo(fromTypeScript[index].z, 3);
    });
  });

  it('separates a pair and leaves the immovable body alone', () => {
    const bodies: OverlapBody[] = [
      { x: 0, z: 0, radius: 0.45, weight: 1 },
      { x: 0.5, z: 0, radius: 0.45, weight: 0 }
    ];
    expect(resolveOverlaps(bodies)).toBeGreaterThan(0);
    expect(bodies[1]).toEqual({ x: 0.5, z: 0, radius: 0.45, weight: 0 });
    expect(bodies[0].x).toBeLessThan(-0.3);
  });

  it('caps one step so a deep overlap does not teleport', () => {
    const bodies: OverlapBody[] = [
      { x: 0, z: 0, radius: 0.45, weight: 1 },
      { x: 0.1, z: 0, radius: 0.45, weight: 1 }
    ];
    resolveOverlaps(bodies, { maxStep: 0.1, iterations: 1 });
    // Equal weights split the cap, and the head-on bias tilts it slightly off the
    // centre line, so compare the distance travelled rather than each component.
    expect(Math.hypot(bodies[0].x, bodies[0].z)).toBeCloseTo(0.05, 3);
    expect(Math.hypot(bodies[1].x - 0.1, bodies[1].z)).toBeCloseTo(0.05, 3);
  });

  it('separates two bodies sharing the exact same point', () => {
    const bodies: OverlapBody[] = [
      { x: 2, z: 2, radius: 0.45, weight: 1 },
      { x: 2, z: 2, radius: 0.45, weight: 1 }
    ];
    expect(resolveOverlaps(bodies)).toBeGreaterThan(0);
    expect(Math.abs(bodies[1].x - bodies[0].x)).toBeGreaterThan(0.5);
  });

  it('does nothing when nobody overlaps', () => {
    const bodies: OverlapBody[] = [
      { x: 0, z: 0, radius: 0.45, weight: 1 },
      { x: 5, z: 0, radius: 0.45, weight: 1 }
    ];
    const before = bodies.map((body) => ({ ...body }));
    expect(resolveOverlaps(bodies)).toBe(0);
    expect(bodies).toEqual(before);
  });
});

describe('agents in a shared lane', () => {
  it('keeps two agents apart while they cross, and both still arrive', () => {
    const left = new FakeAgent('left', -4, -0.6);
    const right = new FakeAgent('right', 4, 0.6);
    const agents = createRuntimeAgents(
      (key) => (key === left.id ? left : key === right.id ? right : null),
      openGrid,
      { staticBodies: () => [{ position: { x: 0, y: 0, z: 0 }, radius: 0.5 }] }
    );
    agents.setObjects([agentObject('left', -4, -0.6), agentObject('right', 4, 0.6)]);

    expect(agents.moveTo('left', 4, -0.6, 2)).toBe(true);
    expect(agents.moveTo('right', -4, 0.6, 2)).toBe(true);

    let closest = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 400; tick += 1) {
      agents.update(0.05);
      const gap = Math.hypot(right.position.x - left.position.x, right.position.z - left.position.z);
      closest = Math.min(closest, gap);
    }

    expect(agents.isMoving('left')).toBe(false);
    expect(agents.isMoving('right')).toBe(false);
    // Two 0.45 m agents may not share space; allow a little slack for the cap.
    expect(closest).toBeGreaterThan(0.8);
    expect(left.position.x).toBeGreaterThan(3);
    expect(right.position.x).toBeLessThan(-3);
  });

  it('lets two agents walking straight at each other slip past', () => {
    // The hard case: identical lane, opposite directions. A pure centre-line push
    // is exactly opposite both agents' travel, so without the lateral bias they
    // lock at contact distance and neither ever arrives.
    const left = new FakeAgent('left', -4, 0);
    const right = new FakeAgent('right', 4, 0);
    const agents = createRuntimeAgents(
      (key) => (key === left.id ? left : key === right.id ? right : null),
      openGrid
    );
    agents.setObjects([agentObject('left', -4, 0), agentObject('right', 4, 0)]);

    agents.moveTo('left', 4, 0, 2);
    agents.moveTo('right', -4, 0, 2);

    let closest = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 400; tick += 1) {
      agents.update(0.05);
      const gap = Math.hypot(right.position.x - left.position.x, right.position.z - left.position.z);
      closest = Math.min(closest, gap);
    }

    expect(agents.isMoving('left')).toBe(false);
    expect(agents.isMoving('right')).toBe(false);
    expect(closest).toBeGreaterThan(0.8);
    expect(left.position.x).toBeGreaterThan(3);
    expect(right.position.x).toBeLessThan(-3);
  });

  it('steps around the player instead of pushing it', () => {
    const npc = new FakeAgent('npc', -2, 0);
    const player = { x: 0, y: 0, z: 0 };
    const agents = createRuntimeAgents(
      (key) => (key === npc.id ? npc : null),
      openGrid,
      { staticBodies: () => [{ position: player, radius: 0.5 }] }
    );
    agents.setObjects([agentObject('npc', -2, 0)]);

    expect(agents.moveTo('npc', 2, 0, 2)).toBe(true);

    let closest = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 400; tick += 1) {
      agents.update(0.05);
      closest = Math.min(closest, Math.hypot(npc.position.x - player.x, npc.position.z - player.z));
    }

    expect(player).toEqual({ x: 0, y: 0, z: 0 });
    expect(agents.isMoving('npc')).toBe(false);
    // 0.45 m agent plus a 0.5 m player, minus the per-step cap slack.
    expect(closest).toBeGreaterThan(0.85);
  });
});
