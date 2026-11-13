# Mochi Platform: System Architecture Blueprint

This document specifies the technical architecture, operational topology, decoupling boundaries, data flows, and security model of Mochi Project.

---

## 1. System Vision and Core Tenets

Mochi is an independent, web-first platform designed for interactive 3D games and creator publishing. It is architected around five core tenets:

1. Web-First Accessibility: Zero mandatory app store downloads; instant gameplay in modern desktop and tablet browsers via WebGL2/WebGPU.
2. Pure Architectural Decoupling: Zero build-time, runtime, or database dependencies on external platforms.
3. Serverless Edge Operations: Control plane and state management execute on globally distributed edge workers (Cloudflare Workers, D1, R2, Durable Objects).
4. Deterministic Sandboxing: Untrusted creator code runs inside isolated sandboxes with strictly scoped capabilities and postMessage RPC interfaces.
5. Infrastructure Portability: Complete parameterization of hostnames, storage buckets, and CORS origins for friction-free migration.

---

## 2. High-Level System Topology

The platform comprises a client tier (`mochi`) and an edge cloud tier (`mochi-cloud`):

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|                                                                         |
|   +--------------------+  +--------------------+  +-----------------+   |
|   |   Web Catalog UI   |  |   Creator Studio   |  | 3D Game Runtime |   |
|   |  (React 19 / Vite) |  |  (Manifest Editor) |  | (WebGL2/WebGPU) |   |
|   +---------+----------+  +---------+----------+  +--------+--------+   |
|             |                       |                      |            |
+-------------|-----------------------|----------------------|------------+
              | HTTPS (REST)          | HTTPS (Upload)       | WSS (State)
              v                       v                      v
+-------------------------------------------------------------------------+
|                           EDGE CLOUD TIER                               |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                 Cloudflare Worker: mochi-cloud                  |   |
|   |      (Hono Router, Dynamic CORS, Auth, Catalog, Publishing)     |   |
|   +--------+------------------------+-----------------------+-------+   |
|            |                        |                       |           |
|            v                        v                       v           |
|   +------------------+    +-------------------+    +----------------+   |
|   |  Cloudflare D1   |    |   Cloudflare R2   |    | Durable Object |   |
|   |  (Relational DB) |    |  (Object Storage) |    |  (GameRoom DO) |   |
|   |   Users, Games,  |    |  Bundles, Models, |    |   Multiplayer  |   |
|   |     Versions     |    |   Audio, Textures |    |   Rooms State  |   |
|   +------------------+    +-------------------+    +----------------+   |
+-------------------------------------------------------------------------+
```

---

## 3. Subsystem Breakdown

### 3.1 Client Tier (`mochi`)
- Catalog Shell: User authentication, discovery grid, search, and game detail overlays.
- Creator Studio: In-browser authoring environment, metadata editor, bundle packager, and version publisher.
- 3D Game Player Runtime: Container providing canvas management, dual-ticker game loop (60Hz physics / 120Hz render), asset streaming with IndexedDB LRU cache, and unified input normalization.
- Sandbox Host: Secure iframe or Web Worker boundary executing creator game scripts in a restricted context.

### 3.2 Edge Cloud Tier (`mochi-cloud`)
- Control Plane Worker: Lightweight Hono-based router handling REST endpoints under `/api/v1/*`.
- Cloudflare D1 Database: SQLite-compatible serverless database storing relational schemas for users, games, versions, and session metrics.
- Cloudflare R2 Object Storage: S3-compatible content-addressed storage for game bundle manifests, compiled scripts, textures, meshes, and audio assets.
- Cloudflare Durable Objects: Distributed stateful actors hosting low-latency WebSocket rooms for multiplayer synchronization.

---

## 4. Decoupling and Isolation Invariants

Mochi enforces strict boundaries to ensure immediate extractability into an independent organization repository:
1. No Shared Dependencies: Zero imports from external packages outside the `Mochi Project` tree.
2. Independent Repositories: `mochi` and `mochi-cloud` can be cloned, developed, and deployed in complete isolation.
3. Parameterized Configuration: No hardcoded domains or URLs in source code. All network endpoints are configured through:
   - Frontend: `VITE_API_URL`, `VITE_CDN_URL`, `VITE_APP_URL`
   - Backend: `APP_ORIGIN`, `API_ORIGIN`, `CDN_ORIGIN`, `CORS_ALLOWED_ORIGINS`
4. Portable Storage Keys: R2 asset keys follow strict relative addressing:
   - `bundles/{gameId}/{version}/mochi-game.json`
   - `bundles/{gameId}/{version}/bundle.js`
   - `assets/{gameId}/{hash}.{ext}`

---

## 5. End-to-End Data Flows

### 5.1 Player Discovery and Game Launch
1. Client loads catalog from `GET /api/v1/games?status=published`.
2. User selects a game; client requests game metadata and active version via `GET /api/v1/games/:id`.
3. Worker retrieves game record and current version manifest from Cloudflare D1.
4. Client downloads `mochi-game.json` manifest from R2 via CDN edge.
5. Runtime validates asset SHA-256 hashes against IndexedDB cache, downloading missing assets from R2.
6. Runtime initializes 3D canvas, spawns sandbox container, transfers initial assets, and starts game loop.

```
Player Browser          mochi-cloud Worker          Cloudflare D1 / R2
     |                          |                            |
     |--- 1. GET /games ------->|                            |
     |<-- 2. Game Metadata -----|--- Query D1 -------------->|
     |                          |                            |
     |--- 3. Fetch Manifest --->|                            |
     |<-- 4. mochi-game.json ---|--- Stream from R2 -------->|
     |                          |                            |
     |--- 5. Verify & Stream Assets (IndexedDB / R2 CDN) --->|
     |--- 6. Launch 3D Runtime -> Sandbox Spawn
```

### 5.2 Creator Publishing Lifecycle
1. Creator finishes game draft in Creator Studio.
2. Studio generates bundle manifest with SHA-256 hashes of all assets and compiled script.
3. Studio requests upload URLs via `POST /api/v1/assets/upload-url`.
4. Worker verifies authentication, generates signed presigned URLs for assets not already in R2, and returns them.
5. Studio uploads assets directly to R2.
6. Studio calls `POST /api/v1/games/:id/publish` with bundle manifest.
7. Worker verifies hashes, records new version in D1 `game_versions`, and points `games.current_version_id` to the new version atomically.

### 5.3 Real-Time Multiplayer Flow
1. Client requests room allocation via `POST /api/v1/rooms`.
2. Worker derives Durable Object ID and returns room token and WebSocket endpoint.
3. Clients establish WebSocket connection to `wss://<host>/api/v1/rooms/:roomId/ws`.
4. Durable Object accepts connections, tracks presence, and broadcasts delta states at 20Hz-30Hz.

---

## 6. Security and Sandboxing Model

```
+-------------------------------------------------------------------------+
|                           BROWSER CONTEXT                               |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | HOST APPLICATION (mochi runtime)                                  |  |
|  | - Controls WebGL2 canvas context, audio context, user auth tokens |  |
|  | - Implements capability gate and postMessage RPC dispatcher       |  |
|  +---------------------------------+---------------------------------+  |
|                                    | JSON-RPC (postMessage)             |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | SANDBOX CONTAINER (Worker or restricted iframe)                   |  |
|  | - CSP: default-src 'none'; script-src 'self' 'unsafe-eval'       |  |
|  | - Sandbox flags: allow-scripts (NO allow-same-origin, NO top)    |  |
|  | - Blocked: window.parent, document.cookie, localStorage, fetch    |  |
|  | - Allowed: MochiBridge.sendInput(), MochiBridge.renderFrame()    |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### Key Security Safeguards
1. Isolation Boundary: Creator games execute in a restricted Web Worker or sandboxed iframe lacking `allow-same-origin`. Creator scripts cannot read parent cookies, session tokens, or local storage.
2. Content Security Policy (CSP): Strict HTTP headers disallow loading unapproved external scripts or exfiltrating data to arbitrary origins.
3. Asset Integrity: Runtime verifies SHA-256 checksum of every asset prior to instantiation. Tampered or corrupted assets are rejected before execution.
4. Presigned Storage Uploads: Creator clients never receive long-lived R2 credentials; all asset uploads use short-lived presigned URLs generated on the edge worker.

### Asset origins

User uploads are served from their own host, not from the app or API origin:

| Origin | Serves | Why separate |
| --- | --- | --- |
| App | HTML, JS, CSS | Anything here runs with the user's session |
| API | `/api/v1/*` | Cookies and bearer tokens live here |
| `PUBLIC_ASSETS_URL` | Content-addressed public files | Immutable cache, no credentials |
| `ACCESS_ASSETS_URL` | Gated files, resolved per request | Same, plus a permission check before a URL exists |

Splitting them is not cosmetic. A user-uploaded file that renders as a document on
the app origin can read the session and call the API as the viewer. On its own
origin it can do neither, and the app's CSP can name the asset host explicitly
instead of allowing everything.

Every asset response also carries, from `routes/assetFiles.ts`:

- `X-Content-Type-Options: nosniff`, so a mislabelled upload is never sniffed into
  a different type.
- `Content-Security-Policy: default-src 'none'; sandbox`, so even a document that
  somehow renders cannot load or run anything.
- `Content-Disposition: attachment` for any content type outside `model/`, `image/`,
  `audio/`, `video/` and `font/`. SVG is explicitly excluded from the inline list
  because it can carry script, and it is refused at upload anyway.

The client never sends credentials to the asset host: `resolveAccessAssetUrl` calls
the API with `credentials: 'include'`, and the returned URL is fetched without them.
