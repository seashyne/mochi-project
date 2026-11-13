// Agent NPCs: the per-agent navigator controller, its Lua surface, and the rule
// that an agent never blocks the grid it walks on.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { GameState } from '../src/engine/runtime/gameState';
import { RuntimeWorld } from '../src/engine/runtime/objectRegistry';
import { ScriptContext } from '../src/engine/runtime/scriptContext';
import { createRuntimeAgents, type AgentBody } from '../src/engine/runtime/runtimeAgents';
import type { RuntimeApiDeps } from '../src/engine/runtime/luaNodeApi';
import { NavGrid } from '../src/engine/navigation/navGrid';
import { buildNavGrid } from '../src/engine/navigation/navGridFromScene';
import { OBJECT_TYPE_DEFAULTS, type StudioObject } from '../src/engine/studio/types';

class FakeAgent implements AgentBody {
  readonly id: string;
  position: { x: number; y: number; z: number };

  constructor(id: string, x: number, z: number, y = 1) {
    this.id = id;
    this.position = { x, y, z };
  }

  getPosition() {
    return this.position;
  }

  setPosition(x: number, y: number, z: number) {
    this.position = { x, y, z };
  }
}

// 10 m of 1 m cells centred on the origin. fromPredicate takes the origin corner
// itself, not a NavGridOptions object.
const openGrid = () => NavGrid.fromPredicate(10, 10, 1, () => true, { x: -5, z: -5 });

function agentObject(id: string, x: number, z: number, name = id): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS.agent;
  return {
    id,
    name,
    type: 'agent',
    position: { x, y: 1, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { ...defaults.defaultScale },
    color: defaults.defaultColor,
    luaScript: ''
  };
}

function walkUntilIdle(
  agents: ReturnType<typeof createRuntimeAgents>,
  key: string,
  maxTicks = 400
): number {
  let ticks = 0;
  while (agents.isMoving(key) && ticks < maxTicks) {
    agents.update(0.05);
    ticks += 1;
  }
  return ticks;
}

/**
 * A walk ends at the centre of the goal cell, the same contract `player.moveTo`
 * has: the pathfinder works in whole cells, so the last waypoint is a centre.
 */
function cellCentre(x: number, z: number) {
  const grid = openGrid();
  const cell = grid.worldToCell(x, z);
  if (!cell) throw new Error(`(${x}, ${z}) is outside the test grid`);
  return grid.cellToWorld(cell.x, cell.y);
}

describe('createRuntimeAgents', () => {
  it('walks an agent to the target, keeping its height', () => {
    const agent = new FakeAgent('npc_1', -4, -4);
    const agents = createRuntimeAgents((key) => (key === agent.id ? agent : null), openGrid);

    expect(agents.moveTo('npc_1', 4, 4, 3)).toBe(true);
    expect(agents.isMoving('npc_1')).toBe(true);

    walkUntilIdle(agents, 'npc_1');

    expect(agents.isMoving('npc_1')).toBe(false);
    expect(agent.position.x).toBeCloseTo(cellCentre(4, 4).x, 4);
    expect(agent.position.z).toBeCloseTo(cellCentre(4, 4).z, 4);
    expect(agent.position.y).toBe(1);
  });

  it('resolves an agent by display name as well as by id', () => {
    const agent = new FakeAgent('npc_1', -4, -4);
    const agents = createRuntimeAgents(
      (key) => (key === agent.id || key === 'Guard' ? agent : null),
      openGrid
    );

    expect(agents.moveTo('Guard', -2, -2)).toBe(true);
    walkUntilIdle(agents, 'Guard');
    expect(agent.position.x).toBeCloseTo(cellCentre(-2, -2).x, 4);
  });

  it('refuses an unknown agent, an off-grid target and a non-finite target', () => {
    const agent = new FakeAgent('npc_1', 0, 0);
    const agents = createRuntimeAgents((key) => (key === agent.id ? agent : null), openGrid);

    expect(agents.moveTo('ghost', 1, 1)).toBe(false);
    expect(agents.moveTo('npc_1', 50, 50)).toBe(false);
    expect(agents.moveTo('npc_1', Number.NaN, 1)).toBe(false);
    expect(agents.isMoving('npc_1')).toBe(false);
  });

  it('stops a walk where it stands', () => {
    const agent = new FakeAgent('npc_1', -4, -4);
    const agents = createRuntimeAgents((key) => (key === agent.id ? agent : null), openGrid);

    agents.moveTo('npc_1', 4, 4, 2);
    for (let tick = 0; tick < 5; tick += 1) agents.update(0.05);
    const stopped = { ...agent.position };
    agents.stop('npc_1');
    for (let tick = 0; tick < 5; tick += 1) agents.update(0.05);

    expect(agents.isMoving('npc_1')).toBe(false);
    expect(agent.position).toEqual(stopped);
  });

  it('reports the origin for a key that does not resolve', () => {
    const agents = createRuntimeAgents(() => null, openGrid);
    expect(agents.position('ghost')).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('drops agents that left the world', () => {
    let alive = true;
    const agent = new FakeAgent('npc_1', -4, -4);
    const agents = createRuntimeAgents((key) => (alive && key === agent.id ? agent : null), openGrid);

    agents.moveTo('npc_1', 4, 4, 2);
    expect(agents.isMoving('npc_1')).toBe(true);

    alive = false;
    agents.setObjects([]);
    expect(agents.isMoving('npc_1')).toBe(false);
  });

  it('keeps runtime-spawned agents that are absent from the object list', () => {
    const agent = new FakeAgent('npc_spawned', -4, -4);
    const agents = createRuntimeAgents((key) => (key === agent.id ? agent : null), openGrid);

    agents.moveTo('npc_spawned', 4, 4, 2);
    agents.setObjects([]);
    expect(agents.isMoving('npc_spawned')).toBe(true);
  });
});

describe('agents and the nav grid', () => {
  it('never blocks the cell an agent stands in', () => {
    const grid = buildNavGrid([agentObject('npc_1', 0, 0)]);
    const cell = grid.worldToCell(0, 0);
    expect(cell).not.toBeNull();
    expect(grid.isWalkable(cell!.x, cell!.y)).toBe(true);
  });

  it('still blocks solid geometry next to it', () => {
    const block: StudioObject = {
      ...agentObject('wall', 3, 0, 'Wall'),
      type: 'block',
      scale: { x: 2, y: 2, z: 2 }
    };
    const grid = buildNavGrid([agentObject('npc_1', 0, 0), block]);
    const cell = grid.worldToCell(3, 0);
    expect(cell).not.toBeNull();
    expect(grid.isWalkable(cell!.x, cell!.y)).toBe(false);
  });
});

describe('Lua agent globals', () => {
  function makeSession(x = -4, z = -4) {
    const world = new RuntimeWorld(new THREE.Scene(), new PhysicsWorld());
    const state = new GameState();
    const logs: string[] = [];
    const def = agentObject('npc_1', x, z);
    const node = world.spawn(def);
    const agents = createRuntimeAgents((key) => (key === node.id ? node : null), openGrid);
    agents.setObjects([def]);

    const deps: RuntimeApiDeps = {
      world,
      player: { getPosition: () => ({ x: 0, y: 0, z: 0 }) } as never,
      audio: { play: () => undefined } as never,
      state,
      log: (_level, message) => logs.push(message),
      setSpawnPoint: () => undefined,
      getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      getTime: () => 0,
      agents
    };

    const contexts: ScriptContext[] = [];
    const run = async (code: string) => {
      const context = new ScriptContext({ node, code, deps });
      contexts.push(context);
      await context.start();
      return context;
    };

    const dispose = () => {
      // Contexts stay open while the test drives update ticks: a Lua callback
      // cannot run once its state is closed.
      contexts.forEach((context) => context.dispose());
      world.clear();
      state.dispose();
    };

    return { world, state, logs, node, agents, run, dispose };
  }

  it('walks the node the script is attached to', async () => {
    const session = makeSession();

    await session.run([
      'local me = script.parent',
      'local started = agent.moveTo(me.id, 4, 4, 3)',
      'if not started then error("agent.moveTo refused the route") end'
    ].join('\n'));

    expect(session.agents.isMoving('npc_1')).toBe(true);
    expect(session.logs.some((line) => line.includes('agent "npc_1" moveTo(4, 4) started'))).toBe(true);

    walkUntilIdle(session.agents, 'npc_1');
    expect(session.node.getPosition().x).toBeCloseTo(cellCentre(4, 4).x, 4);

    session.dispose();
  });

  it('runs the patrol example documented in RUNTIME_AGENTS.md', async () => {
    // Centre of the grid, so both four-metre legs stay inside it.
    const session = makeSession(0, 0);

    // Kept byte-identical to the doc: a test that runs it is the only thing that
    // stops the example from drifting into something that cannot execute.
    await session.run([
      'local me = script.parent',
      'local home = { x = me.position.x, z = me.position.z }',
      'local stride = 4',
      'local leg = 0',
      '',
      'script.onUpdate.Connect(function(dt)',
      '    if agent.isMoving(me.id) then return end',
      '    leg = leg + 1',
      '    local offset = stride',
      '    if leg % 2 == 0 then offset = -stride end',
      '    agent.moveTo(me.id, home.x + offset, home.z, 3)',
      'end)'
    ].join('\n'));

    // Nothing moves until the first tick, which is the point of the example.
    expect(session.agents.isMoving('npc_1')).toBe(false);

    session.node.dispatchUpdate(0.016);
    expect(session.agents.isMoving('npc_1')).toBe(true);
    walkUntilIdle(session.agents, 'npc_1');
    expect(session.node.getPosition().x).toBeCloseTo(cellCentre(4, 0).x, 4);

    // Next tick starts the walk back.
    session.node.dispatchUpdate(0.016);
    expect(session.agents.isMoving('npc_1')).toBe(true);
    walkUntilIdle(session.agents, 'npc_1');
    expect(session.node.getPosition().x).toBeCloseTo(cellCentre(-4, 0).x, 4);

    session.dispose();
  });
});
