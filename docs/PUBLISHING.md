# Mochi Game Publishing Lifecycle and Manifest Specification

This document defines the creator publishing workflow, game bundle manifest format (`mochi-game.json`), asset verification rules, CDN caching policies, and instant version rollback procedures for Mochi Project.

---

## 1. Publishing Lifecycle Overview

Publishing a game on Mochi progresses through five deterministic phases:

```
+-------------------------------------------------------------------------+
|                      CREATOR PUBLISHING WORKFLOW                        |
|                                                                         |
|  [Phase 1] Local Studio Draft & Interactive Sandbox Preview             |
|       |                                                                 |
|       v                                                                 |
|  [Phase 2] Preflight Static Analysis & Resource Budget Validation       |
|       |                                                                 |
|       v                                                                 |
|  [Phase 3] Bundle Packaging & SHA-256 Content-Addressed Hashing        |
|       |                                                                 |
|       v                                                                 |
|  [Phase 4] Direct-to-R2 Upload via Short-Lived Presigned URLs           |
|       |                                                                 |
|       v                                                                 |
|  [Phase 5] Atomic Version Registration in D1 & Edge CDN Propagation     |
+-------------------------------------------------------------------------+
```

### Phase Details
1. Local Draft & Preview: Creator builds the game within the Mochi Studio workspace, testing live hot-reloads inside the local sandbox runtime.
2. Preflight Validation: Studio lints the script AST for forbidden APIs, checks asset dimensions, and calculates total bundle footprint.
3. Bundle Packaging: Assets are assigned deterministic SHA-256 hashes; `mochi-game.json` is generated.
4. Resumable Multipart Upload: Studio hashes each payload incrementally (SHA-256), calls `POST /api/v1/assets/multipart/create`, sends consecutive parts to `PUT /api/v1/assets/multipart/part`, and finalizes with `POST /api/v1/assets/multipart/complete`. Existing content-addressed objects short-circuit the upload entirely. Objects larger than the Worker request ceiling upload in bounded-concurrency parts and can resume without restarting from zero.
5. Atomic Version Registration: Studio submits final signed manifest to `POST /api/v1/games/:id/publish`. The worker creates an immutable row in D1 `game_versions` and updates the active pointer on `games`.

---

## 2. Game Bundle Manifest Specification (`mochi-game.json`)

Every published game version contains a root manifest file named `mochi-game.json`.

### 2.1 Manifest Schema Example
```json
{
  "manifestVersion": "1.0",
  "id": "gm_7f8a12bc90",
  "slug": "space-drift-3d",
  "title": "Space Drift 3D",
  "version": "1.2.0",
  "description": "High-speed arcade space racer featuring 60Hz physics.",
  "author": {
    "id": "usr_99a8b7c6d5",
    "displayName": "AstroDev"
  },
  "entry": "bundle.js",
  "canvas": {
    "aspectRatio": "16:9",
    "scaling": "responsive",
    "orientation": "landscape",
    "minWidth": 960,
    "minHeight": 540
  },
  "capabilities": {
    "audio": true,
    "storage": true,
    "multiplayer": false
  },
  "assets": [
    {
      "path": "models/ship.glb",
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "size": 2415904,
      "contentType": "model/gltf-binary"
    },
    {
      "path": "textures/hull_diffuse.ktx2",
      "hash": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      "size": 1048576,
      "contentType": "image/ktx2"
    },
    {
      "path": "audio/engine_loop.ogg",
      "hash": "4e1243bd22c66e76c2ba9eddc1f91394e57f9f835f8d91a134a41f6e2f1c8411",
      "size": 524288,
      "contentType": "audio/ogg"
    }
  ],
  "publishedAt": "2026-11-07T10:30:00Z"
}
```

### 2.2 TypeScript Interface Contract
```typescript
export interface MochiManifestAsset {
  path: string;
  hash: string;
  size: number;
  contentType: string;
}

export interface MochiGameManifest {
  manifestVersion: "1.0";
  id: string;
  slug: string;
  title: string;
  version: string;
  description: string;
  author: {
    id: string;
    displayName: string;
  };
  entry: string;
  canvas: {
    aspectRatio: "16:9" | "4:3" | "1:1" | "custom";
    scaling: "responsive" | "fixed" | "letterbox";
    orientation: "landscape" | "portrait" | "any";
    minWidth?: number;
    minHeight?: number;
  };
  capabilities: {
    audio: boolean;
    storage: boolean;
    multiplayer: boolean;
  };
  assets: Array<MochiManifestAsset>;
  publishedAt: string;
}
```

### 2.3 Manifest v2 (Chunked Worlds for Multi-GB Games)

Worlds with more than 400 objects (or any world explicitly forced to chunked mode) publish as manifest v2. The manifest itself stays small; world geometry is split into spatial grid chunks stored as separate content-addressed R2 objects and streamed by the player.

```json
{
  "manifestVersion": "2.0",
  "title": "Continent Map",
  "version": "4.0.0",
  "spawn": { "x": 0, "y": 3, "z": 0 },
  "chunking": { "strategy": "grid", "cellSize": 64, "objectLimitPerChunk": 200 },
  "chunks": [
    {
      "id": "c_0_0_0",
      "hash": "<sha256>",
      "key": "assets/sha256/<sha256>",
      "url": "https://<r2-public-domain>/assets/sha256/<sha256>",
      "sizeBytes": 14832,
      "contentType": "application/json",
      "objectCount": 200,
      "bounds": { "min": { "x": -1, "y": 0, "z": -1 }, "max": { "x": 65, "y": 8, "z": 65 } }
    }
  ],
  "assets": [
    {
      "hash": "<sha256>",
      "key": "assets/sha256/<sha256>",
      "url": "https://<r2-public-domain>/assets/sha256/<sha256>",
      "sizeBytes": 2415904,
      "contentType": "model/gltf-binary"
    }
  ]
}
```

- Inline `chunks` are allowed while the serialized manifest is <= 64 KB (draft limit) / <= 256 KB (publish limit).
- Beyond that, Studio uploads a `chunk-index.json` object and references it through `chunkIndex` (`ManifestAssetRef`), removing any practical chunk-count cap below 4096.
- Binary assets (GLB, KTX2, OGG) are listed in `assets` or an external `assetIndex` and fetched by hash.
- Limits: 4096 chunks per manifest, 64 MB per chunk object, 900 GiB per asset.
- The player downloads chunks with bounded concurrency, instantiates meshes/physics incrementally, and disposes cleanly if the player leaves mid-stream.

### 2.4 Upload API Summary

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/assets/multipart/create` | Validate request, dedupe by SHA-256, open R2 multipart session, return signed upload token |
| PUT | `/api/v1/assets/multipart/part` | Upload one part with `X-Upload-Token` |
| POST | `/api/v1/assets/multipart/complete` | Finalize with sorted `{ partNumber, etag }` list, verify total size and stored SHA-256 |
| DELETE | `/api/v1/assets/multipart/abort` | Abort an in-flight session |
| GET | `/api/v1/assets/file/:key` | Serve stored assets and drafts with `Range`, CORS, ETag, and cache headers |

Upload tokens are scoped to a single key/uploadId and expire after 24 hours.

Every part request may include `X-Part-Sha256`; the worker computes the part hash while streaming to R2 and rejects mismatches with 400 instead of storing corrupt data. On completion the worker verifies the total size and, for objects up to 256 MiB, re-reads the stored object and compares its SHA-256 with the client-declared hash (`hashVerified` in the response). Larger objects rely on the per-part hashes plus R2 checksums.

---

## 3. Preflight and Security Validation Rules

Before an upload is permitted, the edge worker and studio engine enforce strict validation rules:

1. Size Budgets:
   - Inline script (`scriptCode`): <= 256 KB.
   - Draft manifest: inline up to 64 KB; larger drafts up to 16 MB are stored as a content-addressed R2 object (`drafts/sha256/{hash}`) with a D1 pointer. Published manifest: <= 256 KB (larger worlds move chunk lists into `chunkIndex`).
   - World chunk object: <= 64 MB each; chunk count <= 4096 per manifest.
   - Individual binary asset: up to 900 GiB via resumable multipart upload.
   - Total game footprint: multi-GB worlds are expected; there is no aggregate package ceiling.
2. Static AST Analysis:
   - Scripts are scanned for forbidden tokens: `eval`, `Function(`, `window.parent`, `document.cookie`, `fetch(`, `XMLHttpRequest`, and `navigator.sendBeacon`.
   - Dynamic external script injections are flagged and rejected.
3. Media Constraints:
   - Textures: Max resolution 2048x2048 px. Power-of-two dimensions recommended.
   - Audio: Formats restricted to Opus (`.ogg`), AAC (`.m4a`), or MP3 (`.mp3`). Uncompressed WAV files over 2 MB are rejected.
   - 3D models: GLB or GLTF uploaded from Studio through the multipart pipeline. Embedded KTX2 textures, Draco geometry, and meshopt compression are decoded in the player from `/basis/` and `/draco/`. Imported models are normalized to a 1-unit footprint on placement. Small models receive one static box fitted to their bounds; models larger than 4 world units with multiple meshes receive a compound of up to six per-mesh boxes. At runtime each placement renders through a two-level LOD (full GLB up close, bounds-fit box proxy beyond 120 units). The Studio CanCollide toggle turns colliders off.
   - Upload content types are restricted to an allowlist (`model/*`, `image/*` except SVG, `audio/*`, `video/*`, `font/*`, JSON, zip, `.mochi`, plain text, octet-stream). Requests with any other type are rejected before R2 is touched.

---

## 4. Cloudflare R2 Storage Hierarchy and Edge Caching

Mochi leverages Cloudflare R2 object storage combined with Cloudflare Edge CDN for global asset distribution.

### 4.1 Key Hierarchy
```
mochi-assets/
|-- bundles/
|   `-- {gameId}/
|       `-- {version}/
|           |-- mochi-game.json       # Immutable version manifest
|           `-- bundle.js             # Compiled entry code
|
`-- assets/
    `-- {gameId}/
        `-- {sha256}.{ext}            # Content-addressed deduped asset
```

### 4.2 Caching and Header Directives
- Content-Addressed Assets (`/assets/sha256/...` and `/drafts/sha256/...`):
  - `Cache-Control: public, max-age=31536000, immutable`
  - Because keys incorporate the SHA-256 hash, assets can be cached permanently at Cloudflare edge nodes and in client HTTP caches.
- Asset file responses (`/api/v1/assets/file/:key`) advertise `Accept-Ranges: bytes`, honor single-range requests with 206/416 responses, and expose `ETag`, `Content-Range`, and `Access-Control-Allow-Origin: *` so the browser cache, OPFS loader, and media elements can seek without re-downloading.
- Game Manifests (`/bundles/.../mochi-game.json`):
  - `Cache-Control: public, max-age=300, stale-while-revalidate=86400`
  - Re-validated periodically to ensure players receive security updates.
- Deduplication Benefit: If a creator updates version `1.1.0` to `1.2.0` and only modifies `bundle.js`, all unchanged 3D models and textures share the existing content-addressed R2 keys.

---

## 5. Version Management and Instant Rollback

Game versions are stored as immutable snapshots in Cloudflare D1.

### 5.1 D1 Version Record
```sql
-- D1 game_versions record
SELECT id, game_id, version, bundle_r2_key, bundle_hash, status
FROM game_versions
WHERE game_id = 'gm_7f8a12bc90';
```

### 5.2 O(1) Instant Rollback Procedure
If a regression or critical bug is discovered in a newly released version, the game can be rolled back in constant time without re-uploading assets:

```typescript
// Edge Worker Rollback Handler (PATCH /api/v1/games/:id/rollback)
export async function rollbackGameVersion(
  db: D1Database,
  gameId: string,
  targetVersion: string,
  creatorId: string
): Promise<void> {
  // 1. Verify caller owns the game
  const game = await db.prepare(
    "SELECT id FROM games WHERE id = ? AND creator_id = ?"
  ).bind(gameId, creatorId).first();

  if (!game) throw new Error("Unauthorized or game not found");

  // 2. Fetch target historical version
  const versionRow = await db.prepare(
    "SELECT id FROM game_versions WHERE game_id = ? AND version = ?"
  ).bind(gameId, targetVersion).first<{ id: string }>();

  if (!versionRow) throw new Error("Target version does not exist");

  // 3. Atomically switch active version pointer
  await db.prepare(
    "UPDATE games SET current_version_id = ?, updated_at = ? WHERE id = ?"
  ).bind(versionRow.id, Date.now(), gameId).run();
}
```

The pointer swap updates the active game version immediately across all global edge locations.
