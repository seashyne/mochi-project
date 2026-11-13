// Scene meshes for placed objects. Split out of sceneLoader so manifest parsing
// and geometry construction can grow independently; the loader re-exports this so
// existing importers keep working.

import * as THREE from 'three';
import { StudioObject } from '../studio/types';
import { buildTerrainGeometry, createTerrainMaterial } from '../studio/terrainMesh';
import { createRuntimeMaterial } from './runtimeMaterial';

// Per-type shading used when an object asks for no surface. Kept here rather than in
// the branches so a live material swap (a script setting `Material`) gets the same
// numbers as the mesh built at load.
const SHADING: Partial<Record<StudioObject['type'], THREE.MeshStandardMaterialParameters>> = {
  block: { roughness: 0.35, metalness: 0.3 },
  platform: { roughness: 0.35, metalness: 0.3 },
  coin: { roughness: 0.2, metalness: 0.9 },
  spawn: { roughness: 0.3, metalness: 0.7 },
  agent: { roughness: 0.4, metalness: 0.15 },
  jump_pad: { roughness: 0.5 }
};

/** The material for an object, including any surface it asks for. */
export function materialFor(obj: StudioObject): THREE.Material {
  const color = new THREE.Color(obj.color);
  const fallback: THREE.MeshStandardMaterialParameters = {
    color,
    ...(SHADING[obj.type] ?? {})
  };
  if (obj.type === 'hazard') {
    fallback.emissive = color;
    fallback.emissiveIntensity = 0.5;
  }
  return createRuntimeMaterial(obj, fallback, false, color);
}

export function buildObjectMesh(obj: StudioObject): THREE.Object3D {
  const color = new THREE.Color(obj.color);
  if (obj.type === 'terrain' && obj.terrain) {
    return new THREE.Mesh(buildTerrainGeometry(obj.terrain), createTerrainMaterial());
  }
  // Joints and emitter markers are authoring aids, not game geometry.
  if (obj.type === 'constraint' || obj.type === 'particle') return new THREE.Group();
  switch (obj.type) {
    case 'platform':
    case 'block': {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geom, materialFor(obj));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    case 'coin': {
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24);
      const mesh = new THREE.Mesh(geom, materialFor(obj));
      mesh.rotation.z = Math.PI / 2;
      return mesh;
    }
    case 'jump_pad': {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.7, 0.2, 16),
        materialFor(obj)
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.5, 16),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.11;
      group.add(base);
      group.add(ring);
      return group;
    }
    case 'hazard': {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      return new THREE.Mesh(geom, materialFor(obj));
    }
    case 'spawn': {
      const geom = new THREE.CylinderGeometry(0.7, 0.7, 0.15, 24);
      return new THREE.Mesh(geom, materialFor(obj));
    }
    case 'agent': {
      // Capsule so an NPC reads as a character rather than a crate. Agents move,
      // so they are never batched (instancedKindFor returns null for them).
      const geom = new THREE.CapsuleGeometry(0.35, 0.9, 4, 12);
      const mesh = new THREE.Mesh(geom, materialFor(obj));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    case 'model':
      return new THREE.Group();
    default:
      return new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        materialFor(obj)
      );
  }
}
