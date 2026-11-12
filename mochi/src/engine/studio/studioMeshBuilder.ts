// Procedural Three.js mesh and material generator for Studio 3D objects
// Extracted to enforce Single Responsibility Principle and file length limits

import * as THREE from 'three';
import { StudioObject, StudioMaterial } from './types';
import { getMaterialTextureSet, getTextureSetFromUrl } from '../materials/materialTextures';
import { createTerrainData } from './terrainCodec';
import { buildTerrainGeometry, createTerrainMaterial } from './terrainMesh';

function buildJointMarker(): THREE.Object3D {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xc084fc, wireframe: true });
  group.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), material));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.035, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xc084fc })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  return group;
}

function buildEmitterMarker(color: THREE.Color): THREE.Object3D {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 0.9, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 })
  ));
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  ));
  return group;
}

export function createStudioMaterial(
  color: THREE.Color,
  matType?: StudioMaterial,
  texturePreset?: string | null,
  textureUrl?: string | null
): THREE.Material {
  const textures = textureUrl
    ? getTextureSetFromUrl(textureUrl)
    : getMaterialTextureSet(texturePreset);
  if (textures?.map) {
    return new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      roughnessMap: textures.roughnessMap,
      color: new THREE.Color('#ffffff'),
      roughness: 0.9,
      metalness: 0.05
    });
  }

  switch (matType) {
    case 'neon':
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.85
      });
    case 'metal':
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.95
      });
    case 'glass':
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.5
      });
    case 'wood':
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.05
      });
    case 'plastic':
    default:
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.45,
        metalness: 0.1
      });
  }
}

function buildWedgeGeometry(): THREE.BufferGeometry {
  // Right triangle rising toward +X, extruded across Z, then centred so the
  // slope passes through the local origin (which the ramp collider relies on).
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.5);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geom.translate(0, 0, -0.5);
  return geom;
}

export function buildObjectMesh(obj: StudioObject): THREE.Object3D {
  const color = new THREE.Color(obj.color);

  if (obj.type === 'model') {
    return new THREE.Group();
  }
  if (obj.type === 'terrain') {
    const geometry = buildTerrainGeometry(obj.terrain ?? createTerrainData());
    return new THREE.Mesh(geometry, createTerrainMaterial());
  }
  if (obj.type === 'constraint') {
    return buildJointMarker();
  }
  if (obj.type === 'particle') {
    return buildEmitterMarker(color);
  }

  const baseMaterial = createStudioMaterial(color, obj.material, obj.materialTexture, obj.textureUrl);

  switch (obj.type) {
    case 'platform':
    case 'block': {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      return new THREE.Mesh(geom, baseMaterial);
    }
    case 'sphere': {
      const geom = new THREE.SphereGeometry(0.5, 24, 16);
      return new THREE.Mesh(geom, baseMaterial);
    }
    case 'cylinder': {
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      return new THREE.Mesh(geom, baseMaterial);
    }
    case 'ramp': {
      const geom = buildWedgeGeometry();
      return new THREE.Mesh(geom, baseMaterial);
    }
    case 'coin': {
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24);
      const mesh = new THREE.Mesh(geom, baseMaterial);
      mesh.rotation.z = Math.PI / 2;
      return mesh;
    }
    case 'jump_pad': {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.7, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
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
      const geom = new THREE.BoxGeometry(1, 0.2, 1);
      const hazardMat = obj.material
        ? baseMaterial
        : new THREE.MeshStandardMaterial({
            color,
            roughness: 0.2,
            emissive: color,
            emissiveIntensity: 0.4
          });
      return new THREE.Mesh(geom, hazardMat);
    }
    case 'spawn': {
      const geom = new THREE.CylinderGeometry(0.7, 0.7, 0.15, 24);
      return new THREE.Mesh(geom, baseMaterial);
    }
    default:
      return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMaterial);
  }
}
