// M15 advanced authoring: terrain codec/mesh/sculpt, joint solver, emitters,
// and manifest round-tripping for the three new object kinds.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RigidBody, PhysicsWorld } from '../src/engine/physics';
import { ConstraintSolver, PhysicsConstraint } from '../src/engine/physics/constraints';
import {
  DEFAULT_TERRAIN_BRUSH,
  TerrainData,
  TerrainBrush,
  normalizeConstraint,
  normalizeParticle
} from '../src/engine/studio/advancedTypes';
import {
  createTerrainData,
  decodeRle,
  decodeTerrainGrid,
  encodeRle,
  normalizeTerrainData,
  terrainCellAt,
  terrainOrigin
} from '../src/engine/studio/terrainCodec';
import { applyTerrainBrush, terrainStats } from '../src/engine/studio/terrainEdit';
import { buildTerrainGeometry } from '../src/engine/studio/terrainMesh';
import { buildTerrainBodies, MAX_TERRAIN_BODIES } from '../src/engine/studio/terrainBodies';
import { ParticleEmitter } from '../src/engine/studio/particleSystem';
import { AdvancedFeatureRuntime } from '../src/engine/studio/advancedRuntime';
import { parseManifestObjects } from '../src/engine/scene/sceneLoader';
import type { StudioObject } from '../src/engine/studio/types';

function flatTerrain(width = 4, depth = 4, height = 2): TerrainData {
  return {
    width, depth, cellSize: 2, voxelHeight: 2,
    heights: encodeRle(new Uint8Array(width * depth).fill(height)),
    materials: encodeRle(new Uint8Array(width * depth))
  };
}

function terrainObject(data: TerrainData): StudioObject {
  return {
    id: 'terrain_1', name: 'Terrain', type: 'terrain',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, color: '#4f9a4a', terrain: data
  };
}

describe('Terrain codec', () => {
  it('round-trips RLE payloads and rejects malformed tokens', () => {
    const values = new Uint8Array([0, 0, 0, 2, 2, 7, 1]);
    expect(Array.from(decodeRle(encodeRle(values), 7, 32)!)).toEqual(Array.from(values));
    expect(decodeRle('2*3,1*4', 7, 32)).not.toBeNull();
    expect(decodeRle('bogus', 7, 32)).toBeNull();
    expect(decodeRle('2*9', 7, 32)).toBeNull();
    expect(decodeRle('99*2', 2, 32)).toBeNull();
    expect(decodeRle('2*2', 4, 32)).toBeNull();
  });

  it('creates deterministic hills and validates hostile payloads', () => {
    const a = createTerrainData(16, 16);
    const b = createTerrainData(16, 16);
    expect(a.heights).toBe(b.heights);
    expect(decodeTerrainGrid(a)!.heights.length).toBe(256);
    expect(normalizeTerrainData(a)).not.toBeNull();
    expect(normalizeTerrainData({ ...a, heights: 'x' })).toBeNull();
    expect(normalizeTerrainData({ ...a, width: 9999 })).toBeNull();
    expect(normalizeTerrainData(null)).toBeNull();
  });

  it('maps world points onto grid cells with bounds checks', () => {
    const grid = decodeTerrainGrid(flatTerrain(4, 4))!;
    const origin = terrainOrigin(grid);
    expect(terrainCellAt(grid, { x: origin.x + 0.1, z: origin.z + 0.1 })).toEqual({ x: 0, z: 0 });
    expect(terrainCellAt(grid, { x: origin.x + 7.9, z: origin.z + 7.9 })).toEqual({ x: 3, z: 3 });
    expect(terrainCellAt(grid, { x: 999, z: 0 })).toBeNull();
  });
});

describe('Terrain mesh and sculpt brushes', () => {
  it('emits only exposed faces for a flat field', () => {
    const geometry = buildTerrainGeometry(flatTerrain(2, 2, 1));
    expect(geometry.userData.quadCount).toBe(16); // 4 tops + 4 bottoms + 8 boundary walls
    expect((geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(96);
    expect((geometry.getAttribute('color') as THREE.BufferAttribute).count).toBe(96);
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it('raises, erases, paints and flattens without mutating the source', () => {
    const source = flatTerrain(8, 8, 2);
    const base = source.heights;
    const brush = (patch: Partial<TerrainBrush>): TerrainBrush => ({ ...DEFAULT_TERRAIN_BRUSH, ...patch });

    const raised = applyTerrainBrush(source, 4, 4, brush({ tool: 'raise', radius: 2, strength: 3 }));
    expect(decodeTerrainGrid(raised)!.heights[4 * 8 + 4]).toBe(5);
    expect(decodeTerrainGrid(raised)!.heights[0]).toBe(2);

    const erased = applyTerrainBrush(source, 4, 4, brush({ tool: 'erase', radius: 2 }));
    expect(decodeTerrainGrid(erased)!.heights[4 * 8 + 4]).toBe(0);

    const painted = applyTerrainBrush(source, 4, 4, brush({ tool: 'paint', radius: 2, material: 'snow' }));
    expect(decodeTerrainGrid(painted)!.materials[4 * 8 + 4]).toBe(3);

    const flattened = applyTerrainBrush(source, 4, 4, brush({ tool: 'flatten', radius: 2, flattenHeight: 6 }));
    expect(decodeTerrainGrid(flattened)!.heights[4 * 8 + 4]).toBe(6);

    expect(source.heights).toBe(base);
    expect(terrainStats(erased).filled).toBeLessThan(terrainStats(source).filled);
  });

  it('merges equal-height cells into a small number of static colliders', () => {
    const bodies = buildTerrainBodies(terrainObject(flatTerrain(8, 8, 3)));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].type).toBe('static');
    expect(bodies[0].getAABB().max.y).toBe(6);
    expect(buildTerrainBodies(terrainObject(createTerrainData(64, 64))).length).toBeLessThanOrEqual(MAX_TERRAIN_BODIES);
    expect(bodies.every((b) => b.userData.ownerId === 'terrain_1')).toBe(true);
  });
});

describe('Constraint solver', () => {
  const pair = () => {
    const shape = { type: 'sphere' as const, radius: 0.5 };
    const a = new RigidBody({ id: 'a', type: 'dynamic', position: { x: 0, y: 0, z: 0 }, shape, mass: 1 });
    const b = new RigidBody({ id: 'b', type: 'dynamic', position: { x: 2, y: 0, z: 0 }, shape, mass: 1 });
    return { a, b, bodies: new Map([['a', a], ['b', b]]) };
  };
  const joint = (patch: Partial<PhysicsConstraint> = {}): PhysicsConstraint => ({
    id: 'j1', kind: 'weld', bodyAId: 'a', bodyBId: 'b', stiffness: 1,
    damping: 0, restLength: 2, axis: { x: 0, y: 1, z: 0 }, anchor: { x: 2, y: 0, z: 0 }, ...patch
  });

  it('pulls a stretched weld back to its rest offset', () => {
    const { a, b, bodies } = pair();
    b.position.x = 6;
    b.updateAABB();
    const solver = new ConstraintSolver();
    solver.add(joint());
    solver.solve(bodies, 1 / 60);
    expect(b.position.x - a.position.x).toBeLessThan(6);
    expect(solver.list()).toHaveLength(1);
  });

  it('lets a slack rope alone but corrects a stretched one', () => {
    const { a, b, bodies } = pair();
    const solver = new ConstraintSolver();
    solver.add(joint({ kind: 'rope', restLength: 4 }));
    solver.solve(bodies, 1 / 60);
    expect(b.position.x).toBe(2);
    b.position.x = 9;
    solver.solve(bodies, 1 / 60);
    expect(b.position.x).toBeLessThan(9);
  });

  it('is reachable through PhysicsWorld.step and resolves prefixed ids', () => {
    const world = new PhysicsWorld({ x: 0, y: 0, z: 0 });
    const shape = { type: 'sphere' as const, radius: 0.5 };
    const a = new RigidBody({ id: 'physics_a', type: 'dynamic', shape, position: { x: 0, y: 0, z: 0 }, mass: 1 });
    const b = new RigidBody({ id: 'physics_b', type: 'dynamic', shape, position: { x: 8, y: 0, z: 0 }, mass: 1 });
    world.addBody(a);
    world.addBody(b);
    world.addConstraint(joint({ bodyAId: 'a', bodyBId: 'b', stiffness: 1 }));
    expect(world.getConstraints()).toHaveLength(1);
    world.step(1 / 60);
    expect(b.position.x - a.position.x).toBeLessThan(8);
    world.clear();
    expect(world.getConstraints()).toHaveLength(0);
  });

  it('clamps hostile constraint and particle payloads', () => {
    expect(normalizeConstraint(null)).toBeNull();
    const c = normalizeConstraint({ kind: 'nope', stiffness: 99, restLength: -5, attachment0: 12 })!;
    expect(c.kind).toBe('weld');
    expect(c.stiffness).toBe(1);
    expect(c.restLength).toBe(0);
    expect(c.attachment0).toBe('');
    expect(normalizeParticle({ rate: 99999, color: 'red', shape: 'bogus' }).rate).toBe(400);
    expect(normalizeParticle({ rate: 99999, color: 'red', shape: 'bogus' }).color).toBe('#ffb347');
  });
});

describe('Runtime integration', () => {
  it('emits particles into the scene and disposes cleanly', () => {
    const scene = new THREE.Scene();
    const obj: StudioObject = {
      id: 'p1', name: 'Emitter', type: 'particle',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, color: '#ffb347',
      particle: { ...normalizeParticle({}), rate: 60, lifetime: 1 }
    };
    const emitter = new ParticleEmitter(obj, obj.particle!, scene);
    expect(scene.children).toHaveLength(1);
    emitter.update(0.2);
    const positions = (scene.children[0] as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(Array.from(positions.array as Float32Array).some((v) => v > -1000)).toBe(true);
    emitter.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('mounts terrain colliders, joints and emitters then removes them', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const terrain = terrainObject(flatTerrain(4, 4, 1));
    const jointObj: StudioObject = {
      id: 'j1', name: 'Joint', type: 'constraint',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, color: '#c084fc',
      constraint: { ...normalizeConstraint({})!, attachment0: 'a', attachment1: 'b' }
    };
    const emitterObj: StudioObject = {
      id: 'p1', name: 'Emitter', type: 'particle',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, color: '#ffb347', particle: normalizeParticle({})
    };
    const runtime = new AdvancedFeatureRuntime(scene, physics);
    runtime.mount([terrain, jointObj, emitterObj]);
    expect(runtime.emitterCount).toBe(1);
    expect(physics.getConstraints()).toHaveLength(1);
    expect(physics.getAllBodies().some((b) => b.userData.terrain === true)).toBe(true);
    runtime.dispose();
    expect(physics.getConstraints()).toHaveLength(0);
    expect(physics.getAllBodies()).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
  });

  it('preserves advanced payloads through manifest parsing and rejects bad RLE', () => {
    const terrain = terrainObject(flatTerrain(4, 4, 2));
    const raw = JSON.stringify({ objects: [terrain] });
    const [parsed] = parseManifestObjects(raw);
    expect(parsed.type).toBe('terrain');
    expect(parsed.terrain?.width).toBe(4);
    expect(decodeTerrainGrid(parsed.terrain!)!.heights[0]).toBe(2);
    const hostile = JSON.stringify({ objects: [{ ...terrain, terrain: { ...terrain.terrain, heights: '9*999' } }] });
    expect(parseManifestObjects(hostile)[0].terrain).toBeUndefined();
  });
});
