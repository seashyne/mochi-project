// Model object factory for imported GLB/GLTF assets placed in Studio worlds.

import { UploadedAsset } from '../../api/multipartUpload';
import { StudioObject, StudioVec3 } from './types';

const MODEL_EXTENSIONS = ['.glb', '.gltf'];

export function isModelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function modelContentType(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  return null;
}

export function modelDisplayName(filename: string): string {
  return filename.replace(/\.(glb|gltf)$/i, '') || 'Imported Model';
}

export interface ModelImportInput {
  filename: string;
  asset: UploadedAsset;
  position?: StudioVec3;
}

export function createModelObject(input: ModelImportInput): StudioObject {
  const suffix = Math.random().toString(36).slice(2, 7);
  return {
    id: `obj_model_${Date.now()}_${suffix}`,
    name: modelDisplayName(input.filename),
    type: 'model',
    position: input.position ?? { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#94a3b8',
    anchored: true,
    canCollide: true,
    assetUrl: input.asset.publicUrl,
    assetKey: input.asset.assetKey,
    assetHash: input.asset.sha256,
    assetSizeBytes: input.asset.sizeBytes,
    assetContentType: input.asset.contentType
  };
}
