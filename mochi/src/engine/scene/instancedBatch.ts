// Batches repeated primitive objects into InstancedMesh draw calls. One batch
// is built per chunk so disposing a chunk still frees its own geometry.

import * as THREE from 'three';
import { StudioObject } from '../studio/types';
import { createRuntimeMaterial, surfaceKey } from './runtimeMaterial';

export type InstanceKind =
  | 'box'
  | 'coin'
  | 'spawn'
  | 'jump_pad_base'
  | 'jump_pad_ring'
  | 'hazard';

interface KindConfig {
  geometry: () => THREE.BufferGeometry;
  /** Builds the batch material from a representative object and its surface. */
  material: (obj: StudioObject, variant?: string) => THREE.Material;
  local?: THREE.Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
  useInstanceColor: boolean;
}

// Ring sits above the pad base and lies flat, matching buildObjectMesh.
const JUMP_PAD_RING_LOCAL = new THREE.Matrix4()
  .makeTranslation(0, 0.11, 0)
  .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

const KINDS: Record<InstanceKind, KindConfig> = {
  box: {
    geometry: () => new THREE.BoxGeometry(1, 1, 1),
    material: (obj) =>
      createRuntimeMaterial(obj, { color: 0xffffff, roughness: 0.35, metalness: 0.3 }, true, new THREE.Color(obj.color)),
    castShadow: true,
    receiveShadow: true,
    useInstanceColor: true
  },
  coin: {
    geometry: () => new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24),
    material: (obj) =>
      createRuntimeMaterial(obj, { color: 0xffffff, roughness: 0.2, metalness: 0.9 }, true, new THREE.Color(obj.color)),
    castShadow: false,
    receiveShadow: false,
    useInstanceColor: true
  },
  spawn: {
    geometry: () => new THREE.CylinderGeometry(0.7, 0.7, 0.15, 24),
    material: (obj) =>
      createRuntimeMaterial(obj, { color: 0xffffff, roughness: 0.3, metalness: 0.7 }, true, new THREE.Color(obj.color)),
    castShadow: false,
    receiveShadow: false,
    useInstanceColor: true
  },
  jump_pad_base: {
    geometry: () => new THREE.CylinderGeometry(0.6, 0.7, 0.2, 16),
    material: (obj) =>
      createRuntimeMaterial(obj, { color: 0x1e293b, roughness: 0.5 }, true, new THREE.Color(obj.color)),
    castShadow: false,
    receiveShadow: false,
    useInstanceColor: false
  },
  jump_pad_ring: {
    geometry: () => new THREE.RingGeometry(0.2, 0.5, 16),
    material: () =>
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    local: JUMP_PAD_RING_LOCAL,
    castShadow: false,
    receiveShadow: false,
    useInstanceColor: true
  },
  hazard: {
    geometry: () => new THREE.BoxGeometry(1, 1, 1),
    material: (obj, variant) =>
      createRuntimeMaterial(
        obj,
        {
          color: 0xffffff,
          emissive: new THREE.Color(variant || '#ef4444'),
          emissiveIntensity: 0.5,
          roughness: 0.2
        },
        true,
        new THREE.Color(obj.color)
      ),
    castShadow: false,
    receiveShadow: false,
    useInstanceColor: true
  }
};

interface BatchTarget {
  kind: InstanceKind;
  variant?: string;
}

function batchTargetsFor(obj: StudioObject): BatchTarget[] {
  switch (obj.type) {
    case 'block':
    case 'platform':
      return [{ kind: 'box' }];
    case 'coin':
      return [{ kind: 'coin' }];
    case 'spawn':
      return [{ kind: 'spawn' }];
    case 'jump_pad':
      return [{ kind: 'jump_pad_base' }, { kind: 'jump_pad_ring' }];
    case 'hazard':
      return [{ kind: 'hazard', variant: obj.color }];
    default:
      return [];
  }
}

export function instancedKindFor(type: StudioObject['type']): InstanceKind | null {
  if (type === 'block' || type === 'platform') return 'box';
  if (type === 'coin') return 'coin';
  if (type === 'spawn') return 'spawn';
  if (type === 'jump_pad') return 'jump_pad_base';
  if (type === 'hazard') return 'hazard';
  return null;
}

function applyTransform(dummy: THREE.Object3D, obj: StudioObject): void {
  dummy.position.set(obj.position.x, obj.position.y, obj.position.z);
  if (obj.type === 'coin') {
    // Coins lie flat; the flat orientation replaces the object's z rotation.
    dummy.rotation.set(obj.rotation.x, obj.rotation.y, Math.PI / 2);
  } else {
    dummy.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
  }
  dummy.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
  dummy.updateMatrix();
}

function batchName(kind: InstanceKind, variant?: string): string {
  if (!variant) return `instances_${kind}`;
  return `instances_${kind}_${variant.replace(/[^a-z0-9]/gi, '')}`;
}

export function buildInstancedBatch(
  objects: StudioObject[],
  kind: InstanceKind,
  variant?: string
): THREE.InstancedMesh | null {
  if (objects.length === 0) return null;

  const config = KINDS[kind];
  const mesh = new THREE.InstancedMesh(
    config.geometry(),
    config.material(objects[0], variant),
    objects.length
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  objects.forEach((obj, index) => {
    applyTransform(dummy, obj);
    if (config.local) dummy.matrix.multiply(config.local);
    mesh.setMatrixAt(index, dummy.matrix);
    if (config.useInstanceColor) mesh.setColorAt(index, color.set(obj.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = batchName(kind, variant);
  mesh.userData = { instanced: true, kind, variant, count: objects.length };
  mesh.castShadow = config.castShadow;
  mesh.receiveShadow = config.receiveShadow;
  return mesh;
}

export function createInstancedBatches(objects: StudioObject[]): THREE.InstancedMesh[] {
  const groups = new Map<string, { kind: InstanceKind; variant?: string; items: StudioObject[] }>();

  for (const obj of objects) {
    for (const target of batchTargetsFor(obj)) {
      const key = `${target.kind}:${target.variant ?? ''}:${surfaceKey(obj)}`;
      const group = groups.get(key);
      if (group) group.items.push(obj);
      else groups.set(key, { ...target, items: [obj] });
    }
  }

  const batches: THREE.InstancedMesh[] = [];
  groups.forEach(({ kind, variant, items }) => {
    const batch = buildInstancedBatch(items, kind, variant);
    if (batch) batches.push(batch);
  });
  return batches;
}
