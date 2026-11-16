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

The last two are **declared and routed in config but not yet bound in the account**;
neither hostname answered an HTTPS request on 2026-11-13. See
`docs/PLATFORM_ROADMAP.md` section 12 for the deploy step and the interim option.

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

### Session cookies

The API accepts two credentials. Native and server callers send
`Authorization: Bearer`; the web app relies on an httpOnly session cookie, so a
script running on the page cannot read the token even if it manages to execute.

| Property | Value | Why |
| --- | --- | --- |
| Name | `mochi_session` | One cookie, one meaning |
| `HttpOnly` | yes | XSS cannot exfiltrate the token |
| `SameSite` | `Lax` | Kept off cross-site POSTs, still sent on top-level navigation |
| `Secure` | yes (off only for a local http server) | No plaintext transport |
| `Max-Age` | 7 days, matching the token lifetime | Cookie and token expire together |

Cookie auth brings CSRF with it, so any unsafe method (anything but GET, HEAD,
OPTIONS) authenticated **by cookie** must also carry `X-Requested-With: mochi`. A
cross-site form cannot set that header, and the CORS policy already allows it for
the configured origins. A Bearer request is exempt: a browser does not attach that
header on its own.

`POST /api/v1/auth/logout` clears the cookie and needs no token - clearing a cookie
grants nothing.

### Making those origins real

Declaring `PUBLIC_ASSETS_URL` and `ACCESS_ASSETS_URL` is not enough: a URL is only
as real as the worker route behind it. `mochi-cloud/wrangler.jsonc` binds both
hosts with `custom_domain` routes alongside the API host. Without them the server
resolves asset URLs to hostnames that answer nothing.

`npm run verify:assets` (also part of `verify:standards`) refuses to pass when:

- either host is missing, not https, or shares the API origin,
- either host has no matching `custom_domain` route,
- public and gated assets share an origin,
- the production client's `VITE_ACCESS_ASSETS_URL`, or the baked-in
  `DEFAULT_ACCESS_ASSET_HOST` fallback, disagrees with the server,
- the development client points somewhere other than the documented empty
  same-origin opt-out.

A variable that silently falls back to a hardcoded string is how this gap
survived. The gate turns that fallback into a checked invariant.

The real `.env.*` files are gitignored, so the tracked templates in
`mochi/config/env.*.example` are the checked source of truth. Copy one to
`mochi/.env.development` or `mochi/.env.production` before a build; the gate also
validates those copies when they exist.

---

## 7. Units and scale

**One world unit = one metre; one unit of time = one second.** A project convention,
not an engine conversion: the TS runtime, WASM kernel and cloud store plain numbers
and never convert units. No second internal unit (studs, feet, tiles) is permitted.

### 7.1 Canonical constants

| Quantity | Value | Source |
| --- | --- | --- |
| Gravity | −18 m/s², deliberately game-tuned, **not** 9.81 | `physics/world.ts` |
| Speed of sound | 343 m/s (Doppler) | `runtime/audioSpatial.ts` |
| Replication | ε 0.01 m / 0.02 rad; quantise 0.01 m / 0.0017 rad | `multiplayer/replication.ts` |
| Movement reconciliation | max 18 m/s, max teleport 25 m, min elapsed 50 ms | `mochi-cloud/src/do/roomMovement.ts` |
| Streaming | load 128 m, unload 192 m, interest 60 m, model cull 300 m | `scene/chunkStream.ts`, `do/roomBinary.ts`, `scene/distanceCulling.ts` |
| Studio snap | 1 m / 15° / 0.25 | `studio/transformGizmo.ts` |
| Agent | radius 0.4 m, avoidance max step 0.25 m | `navigation/navGridFromScene.ts`, `navigation/localAvoidance.ts` |

Two unrelated `cellSize` values exist, **both in metres**: nav grid 1
(`buildNavGrid`) versus manifest chunking 64, validated 8–1024 (`package/manifestV2.ts`).

### 7.2 Distance norms

All distances are Euclidean in local Cartesian metres; no geographic metric is used.

| Layer | Norm | Source |
| --- | --- | --- |
| A* | octile in **cell steps** (1 straight, √2 diagonal), admissible | `navigation/astar.ts` |
| Steering / waypoints | `hypot(dx, dz)`, 2D XZ | `navigation/steering.ts` |
| Avoidance / culling / interest | squared distance vs radius², no sqrt | `navigation/localAvoidance.ts`, `scene/distanceCulling.ts`, `do/roomBinary.ts` |
| Audio / replication / collision | `hypot(dx, dy, dz)`, 3D | `runtime/audioSpatial.ts`, `multiplayer/replication.ts`, `mochi-physics-wasm/src/lib.rs` |

A walk ends at the **centre of the goal cell**, not the requested coordinate (`docs/RUNTIME_AGENTS.md`).

### 7.3 Foreign units: Roblox studs

Roblox studs are an **import-boundary unit only**, never internal; `docs/PLATFORM_ROADMAP.md` compares in this form (1,024 stud ≈ 287 m).

| Roblox unit | Metric | Note |
| --- | --- | --- |
| 1 stud (current) | 0.28 m | Creator Hub "Roblox units", since 2019 |
| 1 stud (legacy) | 0.05 m | pre-2019, from the then-fixed 196.2 stud/s² gravity |
| 1 RMU | 21.952 kg | mass |
| 1 second | 1 second | time is 1:1 |

When content ingestion is implemented:

1. Convert **once** at ingress; never persist studs in a manifest or scene.
2. Scale by dimension: length / velocity / acceleration × `s`, mass × 21.952, force × `21.952 × s`.
3. `normalizeModel()` (`assets/modelLoader.ts`) rescales every GLB to a 1-unit footprint; absolute size comes from the object transform, not the mesh.
4. A 0.28 m Studio snap preset is a UX affordance, not a unit change.
5. `buildNavGrid(objects, { cellSize: 0.28 })` for imported obbies; cells grow `1/cellSize²` (≈12.8×) and the WASM bake is O(cells), so profile first.
