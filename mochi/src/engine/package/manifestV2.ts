// Manifest v2: chunked, asset-referencing world format for multi-gigabyte games.
// The manifest stays small; world chunks and binary assets live in content-addressed
// R2 objects and are streamed by the player on demand.

import { StudioObject, StudioVec3 } from '../studio/types';
import { RemoteEventDef, ServerScript } from '../scripting/serverManifest';
import type { MochiAnimationClip } from '../animation/clip';

export const MANIFEST_V2_INLINE_LIMIT_BYTES = 64 * 1024;

export interface ManifestBounds {
  min: StudioVec3;
  max: StudioVec3;
}

export interface ManifestAssetRef {
  hash: string;
  key: string;
  url: string;
  sizeBytes: number;
  contentType: string;
}

export interface ManifestChunkRef extends ManifestAssetRef {
  id: string;
  bounds: ManifestBounds;
  objectCount: number;
}

export interface ManifestChunkPayload {
  chunkId: string;
  objects: StudioObject[];
}

export interface ManifestChunking {
  strategy: 'grid';
  cellSize: number;
  objectLimitPerChunk: number;
}

export interface MochiManifestV2 {
  manifestVersion: '2.0';
  title: string;
  version: string;
  scriptCode?: string;
  /** Server-authoritative Lua shipped with the world (executed by the room DO). */
  serverScripts?: ServerScript[];
  /** Remote event allowlist the server script may handle. */
  remoteEvents?: RemoteEventDef[];
  /** Keyframed transform clips played by the runtime animation player. */
  animations?: MochiAnimationClip[];
  /** Optional parameter-driven state graph over `animations`. */
  animationStateMachine?: import('../animation/stateMachine').AnimStateMachineDef;
  spawn?: StudioVec3;
  chunking: ManifestChunking;
  chunks?: ManifestChunkRef[];
  chunkIndex?: ManifestAssetRef;
  assets?: ManifestAssetRef[];
  assetIndex?: ManifestAssetRef;
  publishedAt?: string;
}

export interface ChunkWorldOptions {
  cellSize?: number;
  objectLimitPerChunk?: number;
}

export interface ChunkedWorldBuild {
  chunking: ManifestChunking;
  chunks: ManifestChunkPayload[];
  spawn?: StudioVec3;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cellCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function chunkBounds(objects: StudioObject[]): ManifestBounds {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const object of objects) {
    const halfX = Math.abs(object.scale.x) / 2;
    const halfY = Math.abs(object.scale.y) / 2;
    const halfZ = Math.abs(object.scale.z) / 2;
    min.x = Math.min(min.x, object.position.x - halfX);
    min.y = Math.min(min.y, object.position.y - halfY);
    min.z = Math.min(min.z, object.position.z - halfZ);
    max.x = Math.max(max.x, object.position.x + halfX);
    max.y = Math.max(max.y, object.position.y + halfY);
    max.z = Math.max(max.z, object.position.z + halfZ);
  }

  return {
    min: { x: round(min.x), y: round(min.y), z: round(min.z) },
    max: { x: round(max.x), y: round(max.y), z: round(max.z) }
  };
}

// Splits objects into deterministic spatial chunks. Objects in the same grid
// cell are further split so no chunk exceeds the per-chunk object budget.
export function buildChunkedWorld(
  objects: StudioObject[],
  options: ChunkWorldOptions = {}
): ChunkedWorldBuild {
  const cellSize = options.cellSize ?? 64;
  const objectLimitPerChunk = options.objectLimitPerChunk ?? 200;
  const cells = new Map<string, StudioObject[]>();

  for (const object of objects) {
    const gx = cellCoord(object.position.x, cellSize);
    const gz = cellCoord(object.position.z, cellSize);
    const cellKey = `${gx}:${gz}`;
    const bucket = cells.get(cellKey) || [];
    bucket.push(object);
    cells.set(cellKey, bucket);
  }

  const chunks: ManifestChunkPayload[] = [];
  const sortedCells = Array.from(cells.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [cellKey, cellObjects] of sortedCells) {
    const [gx, gz] = cellKey.split(':');
    for (let offset = 0; offset < cellObjects.length; offset += objectLimitPerChunk) {
      const slice = cellObjects.slice(offset, offset + objectLimitPerChunk);
      chunks.push({
        chunkId: `c_${gx}_${gz}_${offset / objectLimitPerChunk}`,
        objects: slice
      });
    }
  }

  const spawnObject = objects.find((object) => object.type === 'spawn');
  return {
    chunking: { strategy: 'grid', cellSize, objectLimitPerChunk },
    chunks,
    ...(spawnObject
      ? {
          spawn: {
            x: spawnObject.position.x,
            y: spawnObject.position.y + spawnObject.scale.y / 2 + 1,
            z: spawnObject.position.z
          }
        }
      : {})
  };
}

export function attachChunkRef(
  payload: ManifestChunkPayload,
  asset: ManifestAssetRef
): ManifestChunkRef {
  return {
    ...asset,
    id: payload.chunkId,
    bounds: chunkBounds(payload.objects),
    objectCount: payload.objects.length
  };
}

export function serializeChunkPayload(payload: ManifestChunkPayload): Blob {
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export { isManifestV2, validateManifestV2 } from './manifestValidation';
export {
  MANIFEST_V2_MAX_CHUNKS,
  MANIFEST_V2_MAX_ASSETS,
  MANIFEST_V2_MAX_CHUNK_BYTES,
  MANIFEST_V2_MAX_ASSET_BYTES
} from './manifestValidation';
