// Builds the manifest payload sent on publish. Small worlds stay as a single
// inline JSON document; large worlds are split into uploaded chunk objects and
// described by a compact manifest v2 document.

import { StudioObject } from '../studio/types';
import { RemoteEventDef, ServerScript } from '../scripting/serverManifest';
import type { AnimStateMachineDef } from '../animation/stateMachine';
import type { EnvironmentState } from '../environment/environmentTypes';
import type { MochiAnimationClip } from '../animation/clip';
import { assetsApi } from '../../api/assets';
import { UploadedAsset } from '../../api/multipartUpload';
import {
  MANIFEST_V2_INLINE_LIMIT_BYTES,
  ManifestAssetRef,
  ManifestChunkRef,
  MochiManifestV2,
  attachChunkRef,
  buildChunkedWorld,
  serializeChunkPayload
} from './manifestV2';

export const CHUNKED_PUBLISH_OBJECT_THRESHOLD = 400;

export type PublishStage = 'uploading-chunks' | 'uploading-index';

export interface PublishWorldOptions {
  title: string;
  version: string;
  objects: StudioObject[];
  scriptCode?: string;
  serverScripts?: ServerScript[];
  remoteEvents?: RemoteEventDef[];
  animations?: MochiAnimationClip[];
  animationStateMachine?: AnimStateMachineDef;
  environment?: EnvironmentState;
  token?: string;
  forceChunked?: boolean;
  onProgress?: (
    stage: PublishStage,
    completed: number,
    total: number,
    bytesUploaded: number
  ) => void;
}

function toAssetRef(asset: UploadedAsset, contentType: string): ManifestAssetRef {
  return {
    hash: asset.sha256,
    key: asset.assetKey,
    url: asset.publicUrl,
    sizeBytes: asset.sizeBytes,
    contentType
  };
}

async function uploadJson(
  payload: unknown,
  filename: string,
  token: string | undefined
): Promise<ManifestAssetRef> {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const asset = await assetsApi.uploadBlob(blob, {
    filename,
    contentType: 'application/json',
    token
  });
  return toAssetRef(asset, 'application/json');
}

export function shouldUseChunkedPublish(
  options: Pick<PublishWorldOptions, 'objects' | 'forceChunked'>
): boolean {
  return (
    Boolean(options.forceChunked) ||
    options.objects.length > CHUNKED_PUBLISH_OBJECT_THRESHOLD
  );
}

// Model objects already reference uploaded content-addressed assets; the
// manifest lists them once so validators and future asset streaming can find
// every binary dependency without walking chunk payloads.
export function collectModelAssets(objects: StudioObject[]): ManifestAssetRef[] {
  const seen = new Set<string>();
  const refs: ManifestAssetRef[] = [];
  for (const obj of objects) {
    if (obj.type !== 'model') continue;
    const { assetUrl, assetKey, assetHash, assetSizeBytes, assetContentType } = obj;
    if (!assetUrl || !assetKey || !assetHash || !assetSizeBytes) continue;
    if (seen.has(assetHash)) continue;
    seen.add(assetHash);
    refs.push({
      hash: assetHash,
      key: assetKey,
      url: assetUrl,
      sizeBytes: assetSizeBytes,
      contentType: assetContentType || 'model/gltf-binary'
    });
  }
  return refs;
}

export async function buildPublishManifest(
  options: PublishWorldOptions
): Promise<string> {
  const { objects, title, version, scriptCode, token, serverScripts, remoteEvents, animations, animationStateMachine, environment } = options;

  if (!shouldUseChunkedPublish(options)) {
    return JSON.stringify({
      objects,
      ...(scriptCode ? { scriptCode } : {}),
      ...(serverScripts?.length ? { serverScripts } : {}),
      ...(remoteEvents?.length ? { remoteEvents } : {}),
      ...(animations?.length ? { animations } : {}),
      ...(animationStateMachine ? { animationStateMachine } : {}),
      ...(environment ? { environment } : {}),
      version
    });
  }

  const world = buildChunkedWorld(objects);
  const chunkRefs: ManifestChunkRef[] = [];
  let uploadedBytes = 0;

  for (let index = 0; index < world.chunks.length; index++) {
    const payload = world.chunks[index];
    const blob = serializeChunkPayload(payload);
    const asset = await assetsApi.uploadBlob(blob, {
      filename: `${payload.chunkId}.json`,
      contentType: 'application/json',
      token
    });
    chunkRefs.push(attachChunkRef(payload, toAssetRef(asset, 'application/json')));
    uploadedBytes += asset.sizeBytes;
    options.onProgress?.(
      'uploading-chunks',
      index + 1,
      world.chunks.length,
      uploadedBytes
    );
  }

  const modelAssets = collectModelAssets(objects);
  const baseManifest: MochiManifestV2 = {
    manifestVersion: '2.0',
    title,
    version,
    ...(scriptCode ? { scriptCode } : {}),
    ...(serverScripts?.length ? { serverScripts } : {}),
    ...(remoteEvents?.length ? { remoteEvents } : {}),
    ...(animations?.length ? { animations } : {}),
    ...(animationStateMachine ? { animationStateMachine } : {}),
    ...(environment ? { environment } : {}),
    ...(world.spawn ? { spawn: world.spawn } : {}),
    ...(modelAssets.length > 0 ? { assets: modelAssets } : {}),
    chunking: world.chunking,
    publishedAt: new Date().toISOString()
  };

  const inlineCandidate = JSON.stringify({ ...baseManifest, chunks: chunkRefs });
  if (new TextEncoder().encode(inlineCandidate).length <= MANIFEST_V2_INLINE_LIMIT_BYTES) {
    return inlineCandidate;
  }

  options.onProgress?.('uploading-index', 0, 1, uploadedBytes);
  const chunkIndex = await uploadJson(
    { chunks: chunkRefs },
    'chunk-index.json',
    token
  );
  options.onProgress?.('uploading-index', 1, 1, uploadedBytes);

  return JSON.stringify({ ...baseManifest, chunkIndex });
}
