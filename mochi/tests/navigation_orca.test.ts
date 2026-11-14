// ORCA: the velocity-space avoidance solver.
//
// The interesting assertions are behavioural, not numeric. A solver that returns a
// plausible velocity but lets two agents lock at contact distance is worthless, and
// that is exactly the failure the positional resolver had to bias its way out of.

import { describe, it, expect } from 'vitest';
import { solveOrca, type OrcaBody } from '../src/engine/navigation/orca';

function body(overrides: Partial<OrcaBody> = {}): OrcaBody {
  return { x: 0, z: 0, vx: 0, vz: 0, radius: 0.4, maxSpeed: 4, weight: 1, ...overrides };
}

describe('orca solver', () => {
  it('leaves a lone agent alone', () => {
    const solved = solveOrca([body({ vx: 2, vz: -1 })]);
    expect(solved[0]).toEqual({ vx: 2, vz: -1 });
  });

  it('never exceeds the speed limit', () => {
    const solved = solveOrca([body({ vx: 10, vz: 0, maxSpeed: 4 })]);
    expect(Math.hypot(solved[0].vx, solved[0].vz)).toBeCloseTo(4, 6);
  });

  it('sends two head-on agents to opposite sides', () => {
    const solved = solveOrca([
      body({ x: 0, z: 0, vx: 2, vz: 0 }),
      body({ x: 2.4, z: 0, vx: -2, vz: 0 })
    ]);
    // One yields left, the other right: same sign would mean a deadlock.
    expect(Math.sign(solved[0].vz)).toBe(-Math.sign(solved[1].vz));
    expect(Math.abs(solved[0].vz)).toBeGreaterThan(0.05);
  });

  it('makes a mover give way to an immovable body', () => {
    const player = body({ x: 1.2, z: 0, radius: 0.5, weight: 0 });
    const npc = body({ x: 0, z: 0, vx: 2, vz: 0 });
    const solved = solveOrca([npc, player]);

    expect(solved[1]).toEqual({ vx: 0, vz: 0 });
    // The mover takes the whole correction, so it must clearly leave the line.
    expect(Math.abs(solved[0].vz)).toBeGreaterThan(0.4);
  });

  it('keeps two agents apart through a full pass', () => {
    const radius = 0.4;
    const agents = [
      body({ x: -3, z: 0, vx: 2, vz: 0, radius }),
      body({ x: 3, z: 0, vx: -2, vz: 0, radius })
    ];
    const goals = [
      { x: 3, z: 0 },
      { x: -3, z: 0 }
    ];
    const dt = 1 / 60;
    let closest = Infinity;

    for (let step = 0; step < 400; step += 1) {
      for (let index = 0; index < agents.length; index += 1) {
        const agent = agents[index];
        const goal = goals[index];
        const dx = goal.x - agent.x;
        const dz = goal.z - agent.z;
        const distance = Math.hypot(dx, dz);
        // Preferred velocity is straight at the goal until it is reached.
        agent.vx = distance > 1e-3 ? (dx / distance) * 2 : 0;
        agent.vz = distance > 1e-3 ? (dz / distance) * 2 : 0;
      }

      const solved = solveOrca(agents, { timeHorizon: 2, timeStep: dt });
      for (let index = 0; index < agents.length; index += 1) {
        agents[index].x += solved[index].vx * dt;
        agents[index].z += solved[index].vz * dt;
        agents[index].vx = solved[index].vx;
        agents[index].vz = solved[index].vz;
      }

      const gap = Math.hypot(agents[0].x - agents[1].x, agents[0].z - agents[1].z);
      closest = Math.min(closest, gap);
    }

    // They passed each other, and never came closer than the sum of the radii.
    expect(agents[0].x).toBeGreaterThan(agents[1].x);
    expect(closest).toBeGreaterThan(radius * 2 - 0.02);
  });
});
