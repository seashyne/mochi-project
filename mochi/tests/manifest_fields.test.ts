// Every field the Studio writes has to survive the manifest round trip. The loader
// rebuilds each object from an explicit whitelist, so a field missing from it is
// silently dropped - which is how materials and parenting were both lost.

import { describe, it, expect } from 'vitest';
import { parseManifestObjects } from '../src/engine/scene/sceneLoader';
import type { StudioObject } from '../src/engine/studio/types';

function manifest(objects: Partial<StudioObject>[]): string {
  return JSON.stringify({ title: 'Fields', version: '1.0.0', objects });
}

const base = {
  type: 'block' as const,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  color: '#8899aa'
};

describe('manifest object fields', () => {
  it('keeps the surface a creator chose', () => {
    const objects = parseManifestObjects(
      manifest([
        { ...base, id: 'a', name: 'A', material: 'metal', materialTexture: 'brick_red' },
        { ...base, id: 'b', name: 'B', textureAccessId: 'acc_1', textureUrl: 'https://x/y.png' }
      ])
    );
    expect(objects[0].material).toBe('metal');
    expect(objects[0].materialTexture).toBe('brick_red');
    expect(objects[1].textureAccessId).toBe('acc_1');
    expect(objects[1].textureUrl).toBe('https://x/y.png');
  });

  it('rejects a material name it does not know instead of trusting it', () => {
    const [object] = parseManifestObjects(
      manifest([{ ...base, id: 'a', name: 'A', material: 'plutonium' as never }])
    );
    expect(object.material).toBeUndefined();
  });

  it('keeps the parent link so the tree is not flattened', () => {
    const objects = parseManifestObjects(
      manifest([
        { ...base, id: 'parent', name: 'Parent' },
        { ...base, id: 'child', name: 'Child', parentId: 'parent' }
      ])
    );
    expect(objects[1].parentId).toBe('parent');
  });
});

describe('field coverage', () => {
  // The loader rebuilds every object from a whitelist, so a field it forgets is lost
  // silently. This walks the whole StudioObject surface once: anything that should
  // survive and does not will fail here rather than in a published world.
  const FULL: StudioObject = {
    id: 'full',
    name: 'Full',
    type: 'block',
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 0.1, y: 0.2, z: 0.3 },
    scale: { x: 2, y: 3, z: 4 },
    color: '#112233',
    material: 'glass',
    materialTexture: 'marble_white',
    textureAccessId: 'acc_9',
    textureUrl: 'https://cdn/x.png',
    anchored: false,
    canCollide: false,
    parentId: 'root',
    luaScript: 'print("hi")',
    assetUrl: 'https://cdn/model.glb',
    assetKey: 'models/a.glb',
    assetHash: 'abc123',
    assetSizeBytes: 4096,
    assetContentType: 'model/gltf-binary'
  };

  it('keeps every field the Studio can write', () => {
    const [round] = parseManifestObjects(JSON.stringify({ objects: [FULL] }));

    for (const key of Object.keys(FULL) as (keyof StudioObject)[]) {
      expect(round[key], `field "${key}" was dropped`).toEqual(FULL[key]);
    }
  });
});
