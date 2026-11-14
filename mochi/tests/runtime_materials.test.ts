// Runtime surfaces: a part's material and texture used to be editor-only. The data
// model carried `material`, `materialTexture` and `textureUrl`, the Studio honoured
// all three, and the game rendered every block with the same hard-coded plastic.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createInstancedBatches } from '../src/engine/scene/instancedBatch';
import { buildObjectMesh } from '../src/engine/scene/objectMeshes';
import { createRuntimeMaterial, setRuntimeTextureResolver, surfaceKey } from '../src/engine/scene/runtimeMaterial';
import { attachWorld } from '../src/engine/scene/attachWorld';
import { PhysicsWorld } from '../src/engine/physics';
import type { StudioObject } from '../src/engine/studio/types';

function block(id: string, extra: Partial<StudioObject> = {}): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#8899aa',
    ...extra
  };
}

function materialOf(mesh: THREE.Object3D): THREE.MeshStandardMaterial {
  return (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
}

describe('runtime materials', () => {
  it('keeps the old look when an object asks for nothing', () => {
    const plain = block('plain');
    const material = createRuntimeMaterial(plain, { color: new THREE.Color('#8899aa'), roughness: 0.35, metalness: 0.3 }, false);

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.35);
    expect((material as THREE.MeshStandardMaterial).metalness).toBeCloseTo(0.3);
  });

  it('applies the named materials', () => {
    const metal = materialOf(buildObjectMesh(block('m', { material: 'metal' })));
    expect(metal.metalness).toBeCloseTo(0.95);
    expect(metal.roughness).toBeCloseTo(0.2);

    const glass = materialOf(buildObjectMesh(block('g', { material: 'glass' })));
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.5);

    const wood = materialOf(buildObjectMesh(block('w', { material: 'wood' })));
    expect(wood.roughness).toBeCloseTo(0.85);
    expect(wood.metalness).toBe(0);
  });

  it('lights a neon part with its own colour', () => {
    const neon = materialOf(buildObjectMesh(block('n', { material: 'neon', color: '#ff3366' })));
    expect(neon.emissiveIntensity).toBeGreaterThan(0.5);
    expect(neon.emissive.getHexString()).toBe('ff3366');
  });

  it('puts the bundled PBR maps on a part that asks for one', () => {
    // Texture loading needs a DOM, which this suite does not have, so the resolver is
    // stubbed. The branch under test is the one that applies the maps to the material.
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    setRuntimeTextureResolver(() => ({ map, normalMap, roughnessMap: null }));

    try {
      const textured = materialOf(buildObjectMesh(block('t', { materialTexture: 'brick_red' })));
      expect(textured.map).toBe(map);
      expect(textured.normalMap).toBe(normalMap);
      // The map carries the albedo, so the base colour must not tint it away.
      expect(textured.color.getHexString()).toBe('ffffff');
    } finally {
      setRuntimeTextureResolver(null);
    }
  });

  it('leaves an uploaded texture out of the batch key only by url', () => {
    expect(surfaceKey({ textureUrl: '/a.png' })).toBe('tex:/a.png');
    expect(surfaceKey({ textureUrl: '/b.png' })).not.toBe('tex:/a.png');
  });

  it('splits instanced batches by surface', () => {
    const plastic = block('p');
    const metal = block('m', { material: 'metal' });
    const alsoPlastic = block('p2');

    const split = createInstancedBatches([plastic, metal]);
    expect(split).toHaveLength(2);

    const merged = createInstancedBatches([plastic, alsoPlastic]);
    expect(merged).toHaveLength(1);
    expect(materialOf(merged[0]).roughness).toBeCloseTo(0.35);
  });

  it('batches neon by colour, because the emissive is baked in', () => {
    const red = block('r', { material: 'neon', color: '#ff0000' });
    const blue = block('b', { material: 'neon', color: '#0000ff' });
    expect(createInstancedBatches([red, blue])).toHaveLength(2);
  });

  it('gives an instanced batch a white base so instance colours show', () => {
    const batch = createInstancedBatches([block('a', { material: 'metal' })])[0];
    expect(materialOf(batch).color.getHexString()).toBe('ffffff');
  });

  it('names the surface in the batch key', () => {
    expect(surfaceKey({})).toBe('plastic');
    expect(surfaceKey({ material: 'metal' })).toBe('metal');
    expect(surfaceKey({ material: 'neon', color: '#ff0000' })).toBe('neon:#ff0000');
    expect(surfaceKey({ materialTexture: 'brick_red' })).toBe('preset:brick_red');
  });
});

describe('published material', () => {
  it('survives publish and reaches the batch built from the manifest', () => {
    // The whole point of the surface fields: a creator picks them in the Studio, they
    // are serialised into the manifest, and the game has to render the same thing.
    const manifest = JSON.stringify({
      title: 'Materials',
      version: '1.0.0',
      objects: [
        {
          id: 'crate', name: 'Crate', type: 'block',
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: '#8899aa', material: 'metal'
        },
        {
          id: 'crate2', name: 'Crate2', type: 'block',
          position: { x: 3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: '#8899aa'
        }
      ]
    });

    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, manifest, new PhysicsWorld());
    const batches = scene.children.filter((child) => (child as THREE.InstancedMesh).isInstancedMesh);
    expect(batches).toHaveLength(2);

    const metalness = batches
      .map((batch) => (batch as THREE.Mesh).material as THREE.MeshStandardMaterial)
      .map((material) => material.metalness)
      .sort((a, b) => a - b);
    expect(metalness[0]).toBeCloseTo(0.3);
    expect(metalness[1]).toBeCloseTo(0.95);

    attachment.dispose();
  });
});
