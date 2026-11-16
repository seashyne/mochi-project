import { MochiEnv } from '../types/env';
import { AssetUploadResponse } from '../types/api';

// Generate unique asset key for R2 storage
export function generateAssetKey(
  prefix: 'bundles' | 'thumbnails' | 'models' | 'avatars',
  filename: string
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${prefix}/${timestamp}-${randomSuffix}-${sanitized}`;
}

// Generate upload URL and public asset distribution URL
export function createUploadUrl(
  env: MochiEnv,
  filename: string,
  contentType: string
): AssetUploadResponse {
  const isModel =
    contentType.includes('gltf') ||
    filename.endsWith('.glb') ||
    filename.endsWith('.gltf');
  const isBundle = contentType.includes('zip') || filename.endsWith('.zip');
  const prefix = isModel ? 'models' : isBundle ? 'bundles' : 'thumbnails';
  const assetKey = generateAssetKey(prefix, filename);

  const apiHost = env.API_HOSTNAME || 'api-game.lenout.com';
  const modelsBase = env.PUBLIC_MODELS_URL || 'https://assets-game.lenout.com';
  const publicBase = isModel
    ? modelsBase
    : env.PUBLIC_ASSETS_URL || 'https://assets-game.lenout.com';

  // Endpoint where clients PUT or POST their binary data
  const uploadUrl = `https://${apiHost}/api/v1/assets/upload?key=${encodeURIComponent(
    assetKey
  )}`;
  const publicUrl = `${publicBase.replace(/\/+$/, '')}/${assetKey}`;

  return {
    uploadUrl,
    publicUrl,
    assetKey
  };
}

// Store asset directly in R2 bucket
export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType: string
): Promise<R2Object> {
  const immutable = key.startsWith('assets/sha256/');
  return await bucket.put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl: immutable
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=86400'
    }
  });
}

// Retrieve asset from R2 bucket
export async function getFromR2(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return await bucket.get(key);
}

// Delete asset from R2 bucket
export async function deleteFromR2(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
}
