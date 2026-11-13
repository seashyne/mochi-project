// Scene meshes for placed objects. Split out of sceneLoader so manifest parsing
// and geometry construction can grow independently; the loader re-exports this so
// existing importers keep working.

import * as THREE from 'three';
import { StudioObject } from '../studio/types';
import { buildTerrainGeometry, createTerrainMaterial } from '../studio/terrainMesh';
import { createRuntimeMaterial } from './runtimeMaterial';

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
      const mat = createRuntimeMaterial(obj, { color, roughness: 0.35, metalness: 0.3 }, false, color);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    case 'coin': {
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24);
      const mat = createRuntimeMaterial(obj, { color, roughness: 0.2, metalness: 0.9 }, false, color);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.z = Math.PI / 2;
      return mesh;
    }
    case 'jump_pad': {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.7, 0.2, 16),
        createRuntimeMaterial(obj, { color: 0x1e293b, roughness: 0.5 }, false, color)
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
      const mat = createRuntimeMaterial(
        obj,
        { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.2 },
        false,
        color
      );
      return new THREE.Mesh(geom, mat);
    }
    case 'spawn': {
      const geom = new THREE.CylinderGeometry(0.7, 0.7, 0.15, 24);
      const mat = createRuntimeMaterial(obj, { color, roughness: 0.3, metalness: 0.7 }, false, color);
      return new THREE.Mesh(geom, mat);
    }
    case 'agent': {
      // Capsule so an NPC reads as a character rather than a crate. Agents move,
      // so they are never batched (instancedKindFor returns null for them).
      const geom = new THREE.CapsuleGeometry(0.35, 0.9, 4, 12);
      const mat = createRuntimeMaterial(obj, { color, roughness: 0.4, metalness: 0.15 }, false, color);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    case 'model':
      return new THREE.Group();
    default:
      return new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        createRuntimeMaterial(obj, { color }, false, color)
      );
  }
}
