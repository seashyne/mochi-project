// GLB/GLTF model object helpers, sanitization, and publish asset references

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { UploadedAsset } from '../src/api/multipartUpload';
import { StudioObject } from '../src/engine/studio/types';
import {
  createModelObject,
  isModelFileName,
  modelContentType,
  modelDisplayName
} from '../src/engine/studio/modelObject';
import { buildObjectMesh, parseManifestObjects } from '../src/engine/scene/sceneLoader';
import { collectModelAssets, buildPublishManifest } from '../src/engine/package/publishWorld';
import { validateManifestV2 } from '../src/engine/package/manifestV2';

const { uploadBlobMock } = vi.hoisted(() => ({ uploadBlobMock: vi.fn() }));
vi.mock('../src/api/assets', () => ({
  assetsApi: { uploadBlob: uploadBlobMock }
}));

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeAsset(overrides: Partial<UploadedAsset> = {}): UploadedAsset {
  return {
    assetKey: `assets/sha256/${HASH_A}`,
    publicUrl: 'https://cdn.test/models/ship.glb',
    sizeBytes: 2415904,
    contentType: 'model/gltf-binary',
    etag: 'etag',
    sha256: HASH_A,
    ...overrides
  };
}

function makeModelObject(id: string, hash = HASH_A): StudioObject {
  return {
    id,
    name: 'ship',
    type: 'model',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#94a3b8',
    assetUrl: `https://cdn.test/models/${hash}.glb`,
    assetKey: `assets/sha256/${hash}`,
    assetHash: hash,
    assetSizeBytes: 1024,
    assetContentType: 'model/gltf-binary'
  };
}

function makeBlock(id: string, x: number): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    color: '#6366f1'
  };
}

afterEach(() => {
  uploadBlobMock.mockReset();
});

describe('model file detection', () => {
  it('accepts GLB and GLTF files and maps their content types', () => {
    expect(isModelFileName('Ship.GLB')).toBe(true);
    expect(isModelFileName('scene.gltf')).toBe(true);
    expect(isModelFileName('texture.ktx2')).toBe(false);
    expect(modelContentType('ship.glb')).toBe('model/gltf-binary');
    expect(modelContentType('scene.gltf')).toBe('model/gltf+json');
    expect(modelContentType('ship.obj')).toBeNull();
    expect(modelDisplayName('Star Ship.glb')).toBe('Star Ship');
  });

  it('creates a model object carrying the uploaded asset metadata', () => {
    const object = createModelObject({ filename: 'Turret.glb', asset: makeAsset() });

    expect(object.type).toBe('model');
    expect(object.id.startsWith('obj_model_')).toBe(true);
    expect(object.name).toBe('Turret');
    expect(object.assetUrl).toBe(makeAsset().publicUrl);
    expect(object.assetHash).toBe(HASH_A);
    expect(object.assetSizeBytes).toBe(2415904);
    expect(object.assetContentType).toBe('model/gltf-binary');
    expect(object.canCollide).toBe(true);
  });
});

describe('model object sanitization', () => {
  it('preserves asset fields when parsing manifests', () => {
    const parsed = parseManifestObjects({ objects: [makeModelObject('m1')] });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'm1',
      type: 'model',
      assetUrl: makeModelObject('m1').assetUrl,
      assetKey: `assets/sha256/${HASH_A}`,
      assetHash: HASH_A,
      assetSizeBytes: 1024,
      assetContentType: 'model/gltf-binary'
    });
  });

  it('drops asset fields when the URL is missing', () => {
    const parsed = parseManifestObjects({
      objects: [{ ...makeModelObject('m1'), assetUrl: undefined }]
    });

    expect(parsed[0].assetUrl).toBeUndefined();
    expect(parsed[0].assetHash).toBeUndefined();
  });

  it('builds an empty group for model objects before the GLB resolves', () => {
    const mesh = buildObjectMesh(makeModelObject('m1'));
    expect(mesh).toBeInstanceOf(THREE.Group);
    expect(mesh.children).toHaveLength(0);
  });
});

describe('publish asset references', () => {
  it('deduplicates model assets by hash and skips incomplete metadata', () => {
    const refs = collectModelAssets([
      makeModelObject('m1', HASH_A),
      makeModelObject('m2', HASH_A),
      makeModelObject('m3', HASH_B),
      { ...makeModelObject('m4'), assetHash: undefined },
      makeBlock('b1', 0)
    ]);

    expect(refs).toHaveLength(2);
    expect(refs.map((ref) => ref.hash)).toEqual([HASH_A, HASH_B]);
  });

  it('includes collected assets in a chunked manifest that passes validation', async () => {
    uploadBlobMock.mockImplementation(async (blob: Blob) => ({
      assetKey: `assets/sha256/${HASH_B}`,
      publicUrl: 'https://cdn.test/chunk.json',
      sizeBytes: blob.size,
      contentType: 'application/json',
      etag: 'etag',
      sha256: HASH_B
    }));
    const objects = [
      ...Array.from({ length: 401 }, (_, i) => makeBlock(`b${i}`, i % 10)),
      makeModelObject('m1')
    ];

    const manifest = JSON.parse(
      await buildPublishManifest({ title: 'World', version: '1.0.0', objects })
    );

    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0].hash).toBe(HASH_A);
    expect(validateManifestV2(manifest)).toEqual([]);
  });
});
