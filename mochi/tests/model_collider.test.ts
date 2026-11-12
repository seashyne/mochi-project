// Auto-fitted colliders for imported GLB/GLTF models in player worlds

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RigidBody, PhysicsWorld } from '../src/engine/physics';
import { StudioObject } from '../src/engine/studio/types';
import { parseManifestObjects } from '../src/engine/scene/sceneLoader';
import {
  attachModelObject,
  buildModelBodies,
  buildModelBody,
  COLLIDER_DETAIL_MIN_SPAN,
  MIN_MODEL_HALF_EXTENT
} from '../src/engine/scene/modelCollider';

const { getModelColliderDataMock, mountModelMock } = vi.hoisted(() => ({
  getModelColliderDataMock: vi.fn(),
  mountModelMock: vi.fn()
}));
vi.mock('../src/engine/assets/modelLoader', () => ({
  getModelColliderData: getModelColliderDataMock,
  mountModel: mountModelMock
}));

function makeModel(overrides: Partial<StudioObject> = {}): StudioObject {
  return {
    id: 'm1',
    name: 'Turret',
    type: 'model',
    position: { x: 2, y: 1, z: -3 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#94a3b8',
    assetUrl: 'https://cdn.test/turret.glb',
    ...overrides
  };
}

function makeWorld(): PhysicsWorld {
  return { addBody: vi.fn() } as unknown as PhysicsWorld;
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  getModelColliderDataMock.mockReset();
  mountModelMock.mockReset();
  mountModelMock.mockReturnValue(vi.fn());
});

function colliderData(
  bounds = { x: 0.5, y: 1, z: 0.5 },
  parts: Array<{ center: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number } }> = []
) {
  return { bounds, parts };
}

describe('model collider fitting', () => {
  it('fits a box to normalized bounds scaled by the object transform', () => {
    const obj = makeModel({ scale: { x: 2, y: 3, z: 1 } });
    const body = buildModelBody(obj, { x: 0.4, y: 1, z: 0.2 });

    expect(body.shape).toEqual({
      type: 'box',
      halfExtents: { x: 0.4, y: 1.5, z: 0.1 }
    });
    expect(body.type).toBe('static');
    expect(body.position.y).toBeCloseTo(2.5);
    expect(body.id).toBe('physics_m1');
  });

  it('keeps a minimum half extent for flat or degenerate geometry', () => {
    const body = buildModelBody(makeModel(), { x: 1, y: 0, z: 1 });
    expect(body.shape.type).toBe('box');
    if (body.shape.type !== 'box') return;
    expect(body.shape.halfExtents.y).toBe(MIN_MODEL_HALF_EXTENT);
    expect(body.position.y).toBeCloseTo(1 + MIN_MODEL_HALF_EXTENT);
  });

  it('rotates the center offset with the model', () => {
    const obj = makeModel({ rotation: { x: Math.PI / 2, y: 0, z: 0 } });
    const body = buildModelBody(obj, { x: 1, y: 1, z: 1 });

    expect(body.position.y).toBeCloseTo(1);
    expect(body.position.z).toBeCloseTo(-3 + 0.5);
  });
});

describe('collider detail level', () => {
  const parts = [
    {
      center: { x: 0, y: 2.5, z: 0 },
      halfExtents: { x: 1, y: 2.5, z: 1 }
    },
    {
      center: { x: 3, y: 0.5, z: 0 },
      halfExtents: { x: 1, y: 0.5, z: 1 }
    }
  ];

  it('uses per-mesh boxes for large models with multiple parts', () => {
    const obj = makeModel();
    const bodies = buildModelBodies(obj, { bounds: { x: 10, y: 5, z: 2 }, parts });

    expect(bodies).toHaveLength(2);
    expect(bodies[0].id).toBe('physics_m1_0');
    expect(bodies[1].id).toBe('physics_m1_1');
    expect(bodies[0].position.y).toBeCloseTo(1 + 2.5);
    expect(bodies[1].position.x).toBeCloseTo(2 + 3);
    expect(bodies[1].userData).toMatchObject({ objectId: 'm1', partIndex: 1 });
  });

  it('keeps a single box below the detail span threshold', () => {
    const obj = makeModel();
    const bodies = buildModelBodies(obj, {
      bounds: { x: COLLIDER_DETAIL_MIN_SPAN - 1, y: 1, z: 1 },
      parts
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0].id).toBe('physics_m1');
  });

  it('falls back to a single box when the model has one mesh', () => {
    const bodies = buildModelBodies(makeModel(), {
      bounds: { x: 10, y: 5, z: 2 },
      parts: [parts[0]]
    });
    expect(bodies).toHaveLength(1);
  });
});

describe('model collider attachment', () => {
  it('mounts the model and adds a static body once bounds resolve', async () => {
    getModelColliderDataMock.mockResolvedValue(colliderData());
    const world = makeWorld();
    const bodies: RigidBody[] = [];
    const container = new THREE.Group();

    attachModelObject(container, makeModel(), world, bodies, () => false);
    await flushAsync();

    expect(mountModelMock).toHaveBeenCalledWith(container, 'https://cdn.test/turret.glb', {
      lod: true
    });
    expect(world.addBody).toHaveBeenCalledTimes(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].isTrigger).toBe(false);
    expect(bodies[0].userData).toMatchObject({ objectId: 'm1', kind: 'model' });
  });

  it('mounts without colliding when CanCollide is off', async () => {
    const world = makeWorld();
    const bodies: RigidBody[] = [];
    const container = new THREE.Group();

    attachModelObject(container, makeModel({ canCollide: false }), world, bodies, () => false);
    await flushAsync();

    expect(mountModelMock).toHaveBeenCalledTimes(1);
    expect(getModelColliderDataMock).not.toHaveBeenCalled();
    expect(world.addBody).not.toHaveBeenCalled();
    expect(bodies).toHaveLength(0);
  });

  it('drops a late collider when the world is already disposed', async () => {
    let resolveData: (data: ReturnType<typeof colliderData>) => void = () => {};
    getModelColliderDataMock.mockReturnValue(
      new Promise((resolve) => { resolveData = resolve; })
    );
    const world = makeWorld();
    let disposed = false;

    attachModelObject(new THREE.Group(), makeModel(), world, [], () => disposed);
    disposed = true;
    resolveData(colliderData({ x: 1, y: 1, z: 1 }));
    await flushAsync();

    expect(world.addBody).not.toHaveBeenCalled();
  });

  it('does nothing for objects without an asset URL', () => {
    const world = makeWorld();
    const cancel = attachModelObject(
      new THREE.Group(),
      makeModel({ assetUrl: undefined }),
      world,
      [],
      () => false
    );

    expect(mountModelMock).not.toHaveBeenCalled();
    expect(world.addBody).not.toHaveBeenCalled();
    expect(typeof cancel).toBe('function');
  });
});

describe('collider flags in manifests', () => {
  it('preserves CanCollide and Anchored through sanitization', () => {
    const parsed = parseManifestObjects({
      objects: [{ ...makeModel(), canCollide: false, anchored: false }]
    });

    expect(parsed[0].canCollide).toBe(false);
    expect(parsed[0].anchored).toBe(false);
  });

  it('leaves the flags undefined when the manifest omits them', () => {
    const parsed = parseManifestObjects({ objects: [makeModel()] });
    expect(parsed[0].canCollide).toBeUndefined();
    expect(parsed[0].anchored).toBeUndefined();
  });
});
