// Instanced primitive batching and model level-of-detail pipeline tests.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { StudioObject } from '../src/engine/studio/types';
import { loadWorldFromManifest } from '../src/engine/scene/sceneLoader';
import {
  buildInstancedBatch,
  createInstancedBatches,
  instancedKindFor
} from '../src/engine/scene/instancedBatch';
import {
  buildModelLod,
  MODEL_LOD_PROXY_DISTANCE
} from '../src/engine/assets/modelLoader';

function obj(
  id: string,
  type: StudioObject['type'],
  position: { x: number; y: number; z: number },
  color = '#6366f1',
  scale = { x: 2, y: 2, z: 2 }
): StudioObject {
  return {
    id,
    name: id,
    type,
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale,
    color
  };
}

describe('instanced primitive batching', () => {
  it('classifies batchable object types', () => {
    expect(instancedKindFor('block')).toBe('box');
    expect(instancedKindFor('platform')).toBe('box');
    expect(instancedKindFor('coin')).toBe('coin');
    expect(instancedKindFor('spawn')).toBe('spawn');
    expect(instancedKindFor('jump_pad')).toBe('jump_pad_base');
    expect(instancedKindFor('hazard')).toBe('hazard');
    expect(instancedKindFor('model')).toBeNull();
  });

  it('writes per-instance transforms and colors into one mesh', () => {
    const objects = [
      obj('b1', 'block', { x: 1, y: 2, z: 3 }, '#ff0000', { x: 2, y: 4, z: 6 }),
      obj('b2', 'block', { x: -1, y: 0, z: 0 }, '#00ff00')
    ];
    const batch = buildInstancedBatch(objects, 'box');
    expect(batch).not.toBeNull();
    if (!batch) return;

    expect(batch.count).toBe(2);
    expect(batch.name).toBe('instances_box');
    expect(batch.instanceColor).not.toBeNull();

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    batch.getMatrixAt(0, matrix);
    matrix.decompose(position, quaternion, scale);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.toArray()).toEqual([2, 4, 6]);

    const color = new THREE.Color();
    batch.getColorAt(0, color);
    expect(color.getHex()).toBe(0xff0000);
    batch.getColorAt(1, color);
    expect(color.getHex()).toBe(0x00ff00);
    expect(batch.boundingSphere).not.toBeNull();
  });

  it('lays coins flat regardless of their stored z rotation', () => {
    const coin = obj('c1', 'coin', { x: 0, y: 1, z: 0 });
    coin.rotation.z = 0.7;
    const batch = buildInstancedBatch([coin], 'coin');
    if (!batch) throw new Error('expected batch');

    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(0, matrix);
    const rotation = new THREE.Euler().setFromRotationMatrix(matrix);
    expect(rotation.z).toBeCloseTo(Math.PI / 2);
  });

  it('creates one batch per kind and skips unsupported objects', () => {
    const batches = createInstancedBatches([
      obj('b1', 'block', { x: 0, y: 0, z: 0 }),
      obj('p1', 'platform', { x: 1, y: 0, z: 0 }),
      obj('c1', 'coin', { x: 2, y: 0, z: 0 }),
      obj('s1', 'spawn', { x: 3, y: 0, z: 0 })
    ]);

    expect(batches.map((batch) => batch.name).sort()).toEqual([
      'instances_box',
      'instances_coin',
      'instances_spawn'
    ]);
    expect(batches.find((batch) => batch.name === 'instances_box')?.count).toBe(2);
  });

  it('groups hazards by color so the emissive glow stays correct', () => {
    const batches = createInstancedBatches([
      obj('h1', 'hazard', { x: 0, y: 0, z: 0 }, '#ef4444'),
      obj('h2', 'hazard', { x: 2, y: 0, z: 0 }, '#ef4444'),
      obj('h3', 'hazard', { x: 4, y: 0, z: 0 }, '#00ff00')
    ]);

    expect(batches).toHaveLength(2);
    const red = batches.find((batch) => batch.userData.variant === '#ef4444');
    expect(red?.count).toBe(2);
    expect((red?.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0xef4444);
    expect(batches.find((batch) => batch.userData.variant === '#00ff00')?.count).toBe(1);
  });

  it('splits jump pads into a base batch and a raised flat ring batch', () => {
    const pad = obj('j1', 'jump_pad', { x: 1, y: 2, z: 3 }, '#10b981', { x: 1, y: 1, z: 1 });
    const batches = createInstancedBatches([pad]);

    expect(batches.map((batch) => batch.name).sort()).toEqual([
      'instances_jump_pad_base',
      'instances_jump_pad_ring'
    ]);

    const ring = batches.find((batch) => batch.name === 'instances_jump_pad_ring');
    if (!ring) throw new Error('expected ring batch');
    const matrix = new THREE.Matrix4();
    ring.getMatrixAt(0, matrix);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    expect(position.y).toBeCloseTo(2.11);
    const euler = new THREE.Euler().setFromQuaternion(rotation);
    expect(euler.x).toBeCloseTo(-Math.PI / 2);
  });

  it('batches world primitives while keeping physics and disposal intact', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const objects = [
      obj('b1', 'block', { x: 0, y: 1, z: 0 }),
      obj('b2', 'block', { x: 2, y: 1, z: 0 }),
      obj('b3', 'platform', { x: 4, y: 1, z: 0 }),
      obj('c1', 'coin', { x: 0, y: 3, z: 0 }),
      obj('c2', 'coin', { x: 2, y: 3, z: 0 }),
      obj('s1', 'spawn', { x: 0, y: 0, z: 0 }),
      obj('j1', 'jump_pad', { x: 1, y: 1, z: 1 }),
      obj('h1', 'hazard', { x: 0, y: 0, z: 5 })
    ];

    const result = loadWorldFromManifest(scene, { objects }, physics);

    expect(result.objectsCount).toBe(8);
    expect(result.bodies).toHaveLength(8);
    expect((scene.getObjectByName('instances_box') as THREE.InstancedMesh).count).toBe(3);
    expect((scene.getObjectByName('instances_coin') as THREE.InstancedMesh).count).toBe(2);
    expect((scene.getObjectByName('instances_spawn') as THREE.InstancedMesh).count).toBe(1);
    expect((scene.getObjectByName('instances_jump_pad_base') as THREE.InstancedMesh).count).toBe(1);
    expect((scene.getObjectByName('instances_jump_pad_ring') as THREE.InstancedMesh).count).toBe(1);
    const hazard = result.meshes.find((mesh) => mesh.userData.kind === 'hazard');
    expect((hazard as THREE.InstancedMesh).count).toBe(1);
    expect(result.meshes).toHaveLength(6);

    result.dispose();
    expect(scene.children).toHaveLength(0);
    expect(physics.getAllBodies()).toHaveLength(0);
  });
});

describe('model LOD pipeline', () => {
  function makeModel(color = 0xff0000): THREE.Group {
    const model = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.y = 0.5;
    model.add(mesh);
    return model;
  }

  it('builds a two-level LOD with a bounds-fit proxy', () => {
    const lod = buildModelLod(makeModel(0xff0000), { x: 2, y: 4, z: 2 });

    expect(lod.levels).toHaveLength(2);
    expect(lod.levels[0].distance).toBe(0);
    expect(lod.levels[1].distance).toBe(MODEL_LOD_PROXY_DISTANCE);

    const proxy = lod.levels[1].object as THREE.Mesh;
    expect(proxy.name).toBe('model_lod_proxy');
    expect(proxy.position.y).toBeCloseTo(2);
    expect((proxy.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xff0000);
  });

  it('switches from full mesh to proxy as the camera moves away', () => {
    const lod = buildModelLod(makeModel(), { x: 1, y: 1, z: 1 });
    lod.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera();

    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld();
    lod.update(camera);
    expect(lod.levels[0].object.visible).toBe(true);
    expect(lod.levels[1].object.visible).toBe(false);

    camera.position.set(MODEL_LOD_PROXY_DISTANCE + 10, 0, 0);
    camera.updateMatrixWorld();
    lod.update(camera);
    expect(lod.levels[0].object.visible).toBe(false);
    expect(lod.levels[1].object.visible).toBe(true);
  });

  it('clamps degenerate proxy dimensions', () => {
    const lod = buildModelLod(makeModel(), { x: 0, y: 0, z: 0 });
    const proxy = lod.levels[1].object as THREE.Mesh;
    const size = new THREE.Box3()
      .setFromObject(proxy)
      .getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0);
    expect(size.y).toBeGreaterThan(0);
    expect(size.z).toBeGreaterThan(0);
  });
});
