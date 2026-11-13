// KHR_materials_variants: parsing helpers (adapted from PlayCanvas, MIT) and
// the three.js binding layer that swaps material skins at runtime.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { GLTF, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createVariantIndex,
  readPrimitiveVariants,
  variantNamesByIndex
} from '../src/engine/vendor/playcanvas/glb/variants';
import {
  GLTFMaterialsVariantsExtension,
  applyMaterialVariant,
  listMaterialVariants,
  readActiveVariant,
  VARIANTS_USER_DATA_KEY
} from '../src/engine/assets/materialVariants';

const variantRoot = {
  extensions: {
    KHR_materials_variants: {
      variants: [{ name: 'Default' }, { name: 'Crimson' }, { name: 'Moss' }]
    }
  }
};

const primitive = {
  attributes: { POSITION: 0 },
  extensions: {
    KHR_materials_variants: {
      mappings: [
        { material: 1, variants: [1] },
        { material: 2, variants: [2] }
      ]
    }
  }
};

describe('createVariantIndex', () => {
  it('returns null when the file declares no variants', () => {
    expect(createVariantIndex({})).toBeNull();
    expect(createVariantIndex({ extensions: {} })).toBeNull();
    expect(createVariantIndex(null)).toBeNull();
  });

  it('returns null when the variant list is empty', () => {
    expect(createVariantIndex({ extensions: { KHR_materials_variants: { variants: [] } } })).toBeNull();
  });

  it('maps every declared name to its index', () => {
    expect(createVariantIndex(variantRoot)).toEqual({ Default: 0, Crimson: 1, Moss: 2 });
  });

  it('skips entries without a usable name', () => {
    const index = createVariantIndex({
      extensions: { KHR_materials_variants: { variants: [{ name: 'A' }, {}, { name: '' }, { name: 'B' }] } }
    });
    expect(index).toEqual({ A: 0, B: 3 });
  });

  it('orders names by declaration index', () => {
    const names = variantNamesByIndex(createVariantIndex(variantRoot) ?? {});
    expect(names).toEqual(['Default', 'Crimson', 'Moss']);
  });
});

describe('readPrimitiveVariants', () => {
  it('returns null when the primitive has no mapping', () => {
    expect(readPrimitiveVariants({ attributes: {} })).toBeNull();
    expect(readPrimitiveVariants({ extensions: { KHR_materials_variants: {} } })).toBeNull();
  });

  it('flattens variant indices to material indices', () => {
    expect(readPrimitiveVariants(primitive)).toEqual({ 1: 1, 2: 2 });
  });

  it('maps several variants that share one material', () => {
    const shared = {
      extensions: { KHR_materials_variants: { mappings: [{ material: 7, variants: [0, 2, 3] }] } }
    };
    expect(readPrimitiveVariants(shared)).toEqual({ 0: 7, 2: 7, 3: 7 });
  });

  it('ignores malformed mappings', () => {
    const broken = {
      extensions: {
        KHR_materials_variants: { mappings: [{ variants: [0] }, { material: 3 }, { material: 4, variants: [1] }] }
      }
    };
    expect(readPrimitiveVariants(broken)).toEqual({ 1: 4 });
  });
});

function buildFixture() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = 'variantMesh';
  scene.add(mesh);

  const defaultMaterial = mesh.material as THREE.Material;
  const crimson = new THREE.MeshStandardMaterial();
  const moss = new THREE.MeshStandardMaterial();
  const materials = [defaultMaterial, crimson, moss];

  const parser = {
    json: { extensions: variantRoot.extensions, meshes: [{ primitives: [primitive] }] },
    associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
    getDependency: async (type: string, index: number) => (type === 'material' ? materials[index] : null)
  };

  return { scene, mesh, parser, defaultMaterial, crimson, moss };
}

describe('GLTFMaterialsVariantsExtension', () => {
  it('binds mapped materials onto the matching mesh', async () => {
    const { scene, mesh, parser, defaultMaterial, crimson, moss } = buildFixture();
    const plugin = new GLTFMaterialsVariantsExtension(parser as unknown as GLTFParser);

    await plugin.afterRoot({ scene } as unknown as GLTF);

    const binding = mesh.userData[VARIANTS_USER_DATA_KEY];
    expect(binding.defaultMaterial).toBe(defaultMaterial);
    expect(binding.variants.Crimson).toBe(crimson);
    expect(binding.variants.Moss).toBe(moss);
    expect(listMaterialVariants(scene)).toEqual(['Crimson', 'Moss']);
  });

  it('does nothing when the file has no variants', async () => {
    const { mesh, parser } = buildFixture();
    const noVariants = { ...parser, json: { meshes: [{ primitives: [{ attributes: {} }] }] } };
    const plugin = new GLTFMaterialsVariantsExtension(noVariants as unknown as GLTFParser);

    await plugin.afterRoot({ scene: new THREE.Group() } as unknown as GLTF);

    expect(mesh.userData[VARIANTS_USER_DATA_KEY]).toBeUndefined();
  });

  it('skips non-mesh associations', async () => {
    const { scene, parser } = buildFixture();
    const group = new THREE.Group();
    const withGroup = {
      ...parser,
      associations: new Map([[group, { meshes: 0, primitives: 0 }]])
    };
    const plugin = new GLTFMaterialsVariantsExtension(withGroup as unknown as GLTFParser);

    await plugin.afterRoot({ scene } as unknown as GLTF);

    expect(group.userData[VARIANTS_USER_DATA_KEY]).toBeUndefined();
  });
});

describe('applyMaterialVariant', () => {
  async function bound() {
    const fixture = buildFixture();
    const plugin = new GLTFMaterialsVariantsExtension(fixture.parser as unknown as GLTFParser);
    await plugin.afterRoot({ scene: fixture.scene } as unknown as GLTF);
    return fixture;
  }

  it('swaps to the requested variant', async () => {
    const { scene, mesh, crimson } = await bound();
    expect(applyMaterialVariant(scene, 'Crimson')).toBe(1);
    expect(mesh.material).toBe(crimson);
  });

  it('restores the file default when passed null', async () => {
    const { scene, mesh, defaultMaterial } = await bound();
    applyMaterialVariant(scene, 'Moss');
    expect(applyMaterialVariant(scene, null)).toBe(1);
    expect(mesh.material).toBe(defaultMaterial);
  });

  it('ignores unknown variant names', async () => {
    const { scene, mesh, defaultMaterial } = await bound();
    expect(applyMaterialVariant(scene, 'Neon')).toBe(0);
    expect(mesh.material).toBe(defaultMaterial);
  });

  it('is a no-op when the material is already active', async () => {
    const { scene } = await bound();
    applyMaterialVariant(scene, 'Crimson');
    expect(applyMaterialVariant(scene, 'Crimson')).toBe(0);
  });

  it('reports the active variant and null for the default', async () => {
    const { scene, mesh } = await bound();
    expect(readActiveVariant(mesh)).toBeNull();
    applyMaterialVariant(scene, 'Moss');
    expect(readActiveVariant(mesh)).toBe('Moss');
  });
});
