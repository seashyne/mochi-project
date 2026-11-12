# Project: Mochi Studio Revamp & Experience Hub

## Architecture

### Split apps (Studio vs Player)

The web client builds as two independent apps that share one engine and one API client:

| App | Document | Entry | Root | Output | Domain |
| --- | --- | --- | --- | --- | --- |
| Player | `mochi/index.html` | `src/apps/player/main.tsx` | `mochi` | `dist/` | game.lenout.com |
| Studio | `mochi/apps/studio/index.html` | `apps/studio/main.tsx` | `mochi/apps/studio` | `dist-studio/` | studio-game.lenout.com |

- Shared, app-agnostic: `src/engine`, `src/api`, `src/store`, `src/i18n`, `src/routes`, `src/apps/shared/useAppBootstrap.ts`.
- Player root is `src/App.tsx` (portal, catalog, social, shop, admin, game viewport). It must never import `components/studio/` or `pages/StudioPage`.
- Studio root is `src/apps/studio/StudioApp.tsx` (Hub + editor + auth). It must never import `AppContent`, `MochiNavbar`, `Sidebar` or `AdminPortal`.
- Cross-app handoff goes through `resolveStudioExternalUrl` / `resolvePlayerExternalUrl` in `src/routes/studioRouting.ts`, which honour `VITE_STUDIO_URL` / `VITE_PLAYER_URL` (defaults in `.env.development`).
- Legacy `/studio` links on the player origin redirect to the Studio app; publishing from Studio opens the new map in the Player app.
- Build scripts: `build:player` / `build:studio`; deploys: `wrangler.jsonc` (player) and `wrangler.studio.jsonc` (studio).
- Invariants are pinned by `mochi/tests/app_split.test.ts`.

- **Frontend Core (`mochi/src`)**:
  - <u>`routes/studioRouting.ts`: URL parser and router resolver supporting `/studio`, `/studio/:mapId`, and `/play/:mapId`.</u>
  - <u>`App.tsx`: Top-level application routing and view switching, keying pages by mapId for full context isolation.</u>
  - <u>`components/studio/`: Studio components including the Experience Hub (`StudioHub.tsx`), templates (`templates/studioTemplates.ts`), and 3D editor panels.</u>
  - <u>`components`</u>`/studio/assets/`: Asset library panel, access sharing dialog, and the `useAssetLibrary` controller.
  - `engine/environment/`: Starter skybox catalog (CC0 HDRIs), environment state contract, and `SceneEnvironment` (EXR + PMREM lighting).
  - `engine/scripting/`: Server script manifest contract and the rate-limited `RemoteEventBus`.
  - `components/FriendsBar.tsx`: Social presence bar with real authenticated user presence and clean empty states (zero dummy mock data).
  - `index.css` & `tailwind.config.js`: Studio semantic design tokens (`colors.studio` and `--studio-*`) providing an eye-friendly dark palette (#1e1e24, #25252b, #282830, #363640, #ededf2).
- **Cloud Backend (`mochi-cloud/src`)**:
  - `routes/drafts.ts`: Hono REST API for `/api/v1/games/drafts` (`save`, `listMine`, `get`, `delete`) backed by D1 SQLite `studio_project_drafts`.
  - `routes/assetAccess.ts`: Grant and share-token management under `/api/v1/access`.
  - `services/assetAccess.ts`: Pure access policy (owner/admin, visibility, user/public/token grants, expiry).
  - `services/serverScriptValidation.ts`: Server-authority validation of `serverScripts` and `remoteEvents` in draft manifests.
  - `routes/auth.ts`: Authentication and community presence endpoint `/api/v1/auth/community`.
  - `routes/studioTeam.ts`: Team Create REST gateway (`/shared`, `/:id/team`, members, `/:id/team/ws`).
  - `do/StudioDraftDO.ts` + `do/draftCollabCore.ts`: per-draft live room, op validation, locks, debounced D1/R2 flush.
  - `services/studioCollabDb.ts`: `studio_collaborators` grants and `studio_collab_sessions` enable/pause state.

## Feature Inventory

| #  | Feature                                    | Description                                                                                                                                                 | Milestone | Source         |
| -- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- |
| 1  | Studio Eye-Friendly Design Tokens          | Add colors.studio and --studio-* tokens (#1e1e24 base, #25252b panels, #282830 ribbon, #363640 borders, #ededf2 soft text) while preserving existing tokens | M1        | Survey 2       |
| 2  | Mock Social Data Removal                   | Eradicate FRIENDS_ROSTER (10 dummy profiles) from FriendsBar.tsx; integrate real authenticated presence and clean empty state                               | M1        | Survey 1, 3    |
| 3  | Pre-Configured Starter Templates           | Create studioTemplates.ts defining Baseplate, Flat Terrain, and Obby starter scenes within the 64KB manifest limit                                          | M2        | Survey 3       |
| 4  | Studio Hub Landing View                    | Create StudioHub.tsx with template chooser, recent drafts list via studioDraftsApi.listMine, and project creation triggers                                  | M2        | Survey 1, 3    |
| 5  | Map ID URL Routing & State Isolation       | Implement /studio, /studio/:mapId, and /play/:mapId routing; key StudioPage and PlayerViewport by mapId; teardown WebGL/physics on map change               | M3        | Survey 1, 3    |
| 6  | Studio 3D Editor UX/UI Overhaul            | Update StudioPage, StudioToolbar, 3D Canvas, Hierarchy, Inspector, Object Palette, and Console to the eye-friendly dark theme                               | M4        | Survey 2       |
| 7  | Opaque-Box E2E Test Suite (Tiers 1-4)      | Comprehensive 4-tier E2E test suite covering Hub, routing, theming, templates, and social presence; publishes TEST_READY.md                                 | E2E Track | Survey 1, 2, 3 |
| 8  | Final Verification & Adversarial Hardening | Pass 100% of E2E tests (Tiers 1-4) and execute Tier 5 adversarial stress testing                                                                            | M5        | Strategy       |
| 9  | Starter Skybox & Environment System        | Bundle 7 CC0 HDR skyboxes from `access/Sky`, add environment manifest contract, EXR/PMREM `SceneEnvironment`, and Studio environment panel                  | M6        | access/ assets |
| 10 | Asset Access Control System                | D1 `asset_access_grants`, pure access policy (user/public/token grants + expiry), grant routes, and R2 read enforcement with private cache headers          | M6        | Request        |
| 11 | Asset Library UX/UI                        | Folder navigation, search, visibility cycling, delete, and share-access dialog over `/api/v1/files` and `/api/v1/access`                                    | M6        | Request        |
| 12 | Server Script & Remote Event System        | `serverScripts`/`remoteEvents` manifest contract, rate-limited `RemoteEventBus`, Studio authoring panel, and Worker-side authority validation               | M6        | Request        |
| 13 | Tier 5 Adversarial Suite                   | 83 new adversarial tests across environment coercion, asset SDK contracts, access policy matrix, and server manifest authority                              | M6        | M5             |
| 14 | Asset Upload & Move                        | Drag-and-drop multi-file upload through the multipart pipeline with progress, auto-filing into the open folder, and per-file folder moves                   | M6        | Follow-up      |
| 15 | Room Flood Control                         | Per-player, per-channel token buckets inside the Durable Object with escalation to a temporary block and cleanup on disconnect                              | M6        | Follow-up      |
| 16 | CC0 PBR Material Library                   | 10 Poly Haven material presets extracted from `access/Texture` and downscaled to 512px (2.3 MB total) with a Studio picker                                  | M6        | access/ assets |
| 17 | Material Texture Rendering                 | `materialTexture` on `StudioObject`, cached texture sets, and textured `MeshStandardMaterial` with colour/normal/roughness maps                             | M6        | M6             |
| 18 | Asset Access Keys (upload-before-use)      | `asset_access_keys` table with opaque `acc_` ids issued at upload time; resolution gate rejects unknown, pending, blocked, or unauthorised ids              | M8        | Request        |
| 19 | Access Asset Domain                        | `ACCESS_ASSETS_URL` binding (default `https://access-game.lenout.com`) plus `VITE_ACCESS_ASSETS_URL` so migrating domains is a config change               | M8        | Request        |
| 20 | Uploaded Texture Materials                 | Studio material picker lists uploaded images by access id; objects store `textureAccessId` plus resolved `textureUrl`, and draft save rejects missing uploads | M8        | Request        |
| 21 | Real Server Lua Interpreter                | Lexer, Pratt parser, tree-walking interpreter, and sandboxed globals (`network`, `state`, `math`, `string`, `table`) with step/depth limits; replaces the regex shim | M9        | Audit          |
| 22 | Room Script Loader & Event Registry        | `POST /api/v1/rooms/:id/script` (auth, 128KB cap) forwards `{code, events}` to the Durable Object, which enforces the declared event allowlist on every `script_rpc` | M9        | Audit          |
| 23 | Rust Kernel Build Pipeline                 | `npm run build:wasm` compiles `mochi-physics-wasm` for wasm32-unknown-unknown, copies the binary into `mochi/public/wasm`, and verifies the exported kernel surface | M10       | Audit          |
| 24 | Kernel-Wired Raycast & Sphere-Box          | New `ray_intersect_aabb_normal` export plus inside-box handling in `test_sphere_aabb`; `CollisionDetector.raycastBody` and `testSphereBox` now run through the Rust kernel with TS parity fallbacks | M10       | Audit          |
| 25 | Filtered Ray Queries                       | `raycast(origin, dir, max, { ignoreBodyId, includeTriggers })` so casters stop hitting their own body and trigger volumes are opt-in | M11       | Audit          |
| 26 | Multi-Probe Ground Detection               | Five-point probe with a slope limit, ground snapping, and jump buffering replaces the per-body raycast loop in the character controller | M11       | Audit          |
| 27 | Iterative Contact Solver                   | Four velocity passes plus three positional passes that re-derive depth, with a restitution threshold that removes resting jitter | M11       | Audit          |
| 28 | Adaptive Substepping                       | Bodies moving further than 0.25 m per step are split into up to six substeps so thin floors are not tunnelled; trigger events still fire once per step | M11       | Audit          |
| 29 | Oriented Box Colliders                     | Rotated boxes now use SAT box-box, sphere-OBB, and OBB raycasts, and authored scene rotations are passed into every collider | M11       | Audit          |
| 30 | Server Script Delivery                     | The room loads the published `serverScripts` from the game version manifest on first join, caches the bundle in DO storage, and invalidates it against `current_version_id` | M12       | Audit          |
| 31 | Persistent Player Data                     | `player_data` D1 table with a load-on-join cache, `player.data.get/set/increment` scoped to the calling player, debounced writes, and a durable DO alarm flush | M12       | Audit          |
| 32 | Lua Standard Library                       | `pcall`/`error`/`assert`/`lastError`, `string.format`, trigonometry, `table.remove`/`table.sort`, `time`/`clock`, and seeded `math.random` | M12       | Audit          |
| 33 | Room Sharding                              | Capacity-aware shard assignment per game with a hot-shard cache and a `/api/v1/rooms/:id/assign` discovery endpoint | M12       | Audit          |
| 34 | Player Lifecycle Hooks                     | `room.onPlayerAdded` / `room.onPlayerRemoving` run inside the script with `player.data` bound, and live outside the remote event registry so a client can never invoke them | M13       | Audit          |
| 35 | Shard Pinning for Parties                  | `?shard=N` pins a room instance, the room reports its shard in `room_state` and `/state`, and the client URL helper accepts a shard so friends can meet | M13       | Audit          |
| 36 | Lua Multi-Return                           | Functions return several values, only the tail expression of a list expands, and `pcall` returns `(ok, ...)` with the error message as the second value | M14       | Audit          |
| 37 | Room Invite Chip                           | The player HUD shows the current instance and copies a `?shard=N` invite link so a friend joins the same room | M14       | Audit          |
| 38 | Voxel Terrain Editor                       | RLE-compact heightfield Terrain object, exposed-face meshing with per-cell materials, six sculpt brushes, and merged static colliders | M15       | Request        |
| 39 | Physics Constraints / Joints                | Weld, hinge, spring, rope and rod joints solved per substep inside `PhysicsWorld`, with editor-authored attachment ids | M15       | Request        |
| 40 | Particle Emitters                          | Pooled `THREE.Points` emitters with rate/lifetime/spread/gravity, authored in Studio and mounted in playtest + published runtime | M15       | Request        |
| 41 | Graph-Aware Clipboard                     | Ctrl+C/Ctrl+X/Ctrl+V with descendant preservation, fresh ids, remapped parentId, constraint attachment remap, and paste offset stacking | M16       | Request        |
| 42 | Multi-Select Gizmo Transforms             | Gizmo drag applies the same delta to every selected object with snapshot-based anti-drift, supporting translate/rotate/scale with one merged undo step | M16       | Request        |
| 43 | Viewport Camera Controls                  | WASD flycam, right-drag pan, Focus (F) on selection, four view presets (iso/top/front/right), and configurable grid/rotation/scale snap increments | M16       | Request        |
| 44 | Joint Visualisation Lines                 | Overlay lines drawn between constraint attachment points so joints are visible in the editor viewport | M16       | Request        |
| 45 | CSS Design Token System                   | Single-source-of-truth `--studio-*-rgb` CSS variables with dark/light theme support, Tailwind `rgb(var() / <alpha>)` mapping, semantic state tokens, object-type identity classes, and reusable utility classes replacing all hardcoded palette colours | M16       | Request        |
| 46 | Team Create Collaborative Editing    | Owner/invite/role management, shared drafts, per-draft Durable Object room, live ops, presence, object locks, server-authoritative save, and token-only Studio UI | M17       | Request        |
| 47 | Studio Shell & Declarative Property Grid | Menu bar, ribbon tabs with group bodies, docked toolbox/explorer/properties/output, status bar command line, and a data-driven property schema (`PropertyGroupDef` + `PropertyControl`) shared by services and parts | M18       | Refactor       |

## Milestones

| #   | Name                                              | Scope                                                                                                        | Dependencies | Status |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| M1  | Design Tokens & Social Mock Removal               | Add studio color scale to tailwind and CSS; clean mock friends in FriendsBar.tsx                             | none         | DONE   |
| M2  | Templates & Studio Hub Landing View               | Implement studioTemplates.ts and modular StudioHub.tsx with drafts list                                      | M1           | DONE   |
| M3  | Map ID Routing & State Isolation                  | Extend studioRouting.ts and App.tsx for /studio/:mapId and /play/:mapId with clean map state isolation       | M2           | DONE   |
| M4  | Studio 3D Editor UX/UI Overhaul                   | Modernize all Studio 3D editor panels and canvas container to eye-friendly dark palette                      | M1, M3       | DONE   |
| M5  | Final Milestone: 100% E2E Pass & Tier 5 Hardening | Validate 100% pass across E2E test suite Tiers 1-4 and execute Tier 5 adversarial hardening                  | M1-M4, E2E   | DONE   |
| E2E | E2E Testing Track                                 | Author comprehensive opaque-box E2E test suite (Tiers 1-4) and publish TEST_READY.md                         | none         | DONE   |
| M6  | Asset Platform & Server Authoring                 | Starter skyboxes, asset access grants, asset library UI, server script/remote event system, and Tier 5 suite | M5           | DONE   |
| M7  | Upload, Flood Control & Materials                 | Drag-and-drop upload with folder filing, DO rate limiting, and the CC0 PBR material library                  | M6           | DONE   |
| M8  | Access Keys & Asset Domain                        | Opaque access ids, upload-before-use enforcement on draft save, and the rebindable access asset origin       | M7           | DONE   |
| M9  | Real Server Scripting                             | Replace the regex shim with a real interpreter, expose the room script loader, and enforce the remote event registry | M8           | DONE   |
| M10 | Physics Kernel Verification                       | Reproducible Rust build pipeline and kernel-backed raycast / sphere-box narrowphase with parity tests                  | M9           | DONE   |
| M11 | Physics Solver & Collider Fidelity                | Filtered rays, multi-probe grounding, iterative solver, substepping, and oriented box colliders                      | M10          | DONE   |
| M12 | Server Authoring Runtime                          | Automatic script delivery to rooms, persistent per-player data, a fuller Lua stdlib, and capacity-aware room shards  | M11          | DONE   |
| M13 | Room Lifecycle & Party Joining                    | Player join/leave hooks for scripts, a live player count, and shard pinning so a party can share an instance        | M12          | DONE   |
| M14 | Lua Fidelity & Party Invites                      | True multi-return (including `pcall(ok, err)`) and an in-game invite chip that copies a shard-pinned link            | M13          | DONE   |
| M15 | Terrain, Constraints & Particles                  | Voxel sculpting, joint solver, particle emitters across editor, playtest and published runtime                          | M14          | DONE   |
| M16 | Editor Parity & CSS Tokens                        | Clipboard, multi-select gizmo, flycam/view presets/snap config, joint overlay, and unified CSS design token system       | M15          | DONE   |
| M17 | Team Create Studio                    | Roles, shared drafts, WebSocket live editing, presence/locks/awareness, DO persistence, and CSS-token-only UI       | M16          | DONE   |
| M18 | Studio Shell & Property Grid          | Shell chrome extraction, declarative property schema, legacy panel removal, and shell test coverage                | M17          | DONE   |

## Interface Contracts

### studioRouting.ts <-> App.tsx

|   |   |
| - | - |

- `parseStudioRoute(pathname: string, search: string)`: returns `{ isStudio: boolean, mapId: string | null }`.
- `parsePlayRoute(pathname: string)`: returns `{ isPlay: boolean, mapId: string | null }`.
- `resolveStudioPath(mapId?: string | null)`: returns `mapId ? '/studio/' + mapId : '/studio'`.
- `resolvePlayPath(mapId: string)`: returns `'/play/' + mapId`.

### studioTemplates.ts <-> StudioHub.tsx

- `STUDIO_TEMPLATES`: Array of `StudioTemplateDefinition` `{ id: string, name: string, description: string, previewType: string, objects: StudioSceneObject[], scriptCode: string }`.
- Templates:
  - `baseplate`: Dark slate 64x64 grid, spawn pad, standard starter Lua script.
  - `flat_terrain`: Expansive grass 80x80 platform, spawn pad, scenic platforms.
  - `obby`: Obstacle course with spawn island, neon jump steps, hazard lava floor, checkpoint, and victory podium.

### studioDraftsApi <-> StudioHub.tsx

- `studioDraftsApi.listMine(token?: string)`: returns `{ drafts: StudioDraftRecord[], total: number }`.
- `studioDraftsApi.save(payload: SaveDraftPayload, token?: string)`: returns `{ draft: StudioDraftRecord }`.

### Team Create Contracts

- D1: `studio_collaborators(map_id, user_id, role, invited_by, created_at)` and `studio_collab_sessions(map_id, owner_id, enabled, created_at, updated_at)` (migrations `0019` / `0020`). The draft creator (or an admin) is the implicit `owner`; collaborators are `editor` or `viewer`.
- REST: `GET /api/v1/games/drafts/shared`, `GET|POST /:id/team`, `GET|POST /:id/team/members`, `PATCH|DELETE /:id/team/members/:userId`. Only the owner manages the session and grants. Pausing keeps invites; role changes and removals call the DO `/revoke` control request (`userId: *` evicts everyone).
- WebSocket: `GET /:id/team/ws?token=<jwt>` (browsers cannot set Authorization headers). The route verifies the token, rejects paused rooms with 409 and forwards verified `x-mochi-user-*` headers to `STUDIO_DRAFT`.
- Protocol: `init`, `op`, `presence`, `locks`, `awareness`, `saved`, `error`, `resync`, `ping`/`pong`. Ops are `add`, `remove`, `update`, `bulk`, `manifest_patch`; bulk cannot nest and object ids are immutable.
- Server authority: editors patch only `scriptCode`, `language`, `environment`, `version`; owners also patch `serverScripts`, `remoteEvents`, `title`. `objects` can never be replaced through `manifest_patch`, and `__proto__`/`constructor`/`prototype` keys are rejected. A selected object is locked, so another editor cannot update or remove it.
- The DO is the single writer during a live session and debounces `persistCollabDraft()` into D1/R2 via `alarm()`. Offline, editors may still save a shared draft through `POST /api/v1/games/drafts`, but ownership never transfers.
- Frontend: `src/components/studio/team/` owns `teamOps` (pure diffs), `TeamCreateClient` (reconnecting socket), `useTeamRoom` (REST), `useTeamSync` (convergence), `useTeamCreate`, `useStudioTeamBridge`, and the token-only panel/presence/controls UI localized through the dedicated 4-locale `team` i18n domain (`src/i18n/locales/*StudioTeam.ts`). Version gaps or rejected ops trigger `resync`.

### Theme Tokens <-> Studio Components

- Background canvas well: `bg-studio-bg` (`#1e1e24`)
- Docked panels & drawers: `bg-studio-panel` (`#25252b`)
- Top ribbon & header bars: `bg-studio-ribbon` (`#282830`)
- Subdued borders: `border-studio-border` (`#363640`)
- Soft primary text: `text-studio-text` (`#ededf2`)
- Soft muted text: `text-studio-muted` (`#a0a0ab`)
- Modal scrims: `bg-studio-overlay/60` (`--studio-overlay-rgb`, dark `6 8 14` / light `15 23 42`). All Studio UI must use `studio-*` tokens only.

## Server Scripting Contracts

- The room id in the client is `room_<slug>`; `GET /api/v1/rooms/:id/ws` resolves the shard (`room_<slug>#N`) before forwarding to the Durable Object. `?shard=N` pins a specific instance, and the room echoes its shard in `room_state` and `/state`.
- On the first join, the DO reads `games.current_version_id` and loads the matching `game_versions.manifest_json` `serverScripts` (enabled only) plus `remoteEvents` with `direction: 'toServer'`. The bundle is cached in DO storage and rebuilt when the version pointer changes.
- Script globals: `print`, `network.{OnServerEvent,FireClient,Broadcast}`, `room.{onPlayerAdded,onPlayerRemoving,playerCount}`, `state.{get,set}`, `player.data.{get,set,increment}`, `math`, `string`, `table`, `pcall`/`error`/`assert`/`lastError`, `time`, `clock`. `os` is deliberately absent.
- Lua functions may return several values. Only the tail expression of an assignment, return, argument list, or table constructor expands; every other position takes the first value. `pcall` returns `(true, ...results)` or `(false, message)`, and `lastError()` still exposes the message.
- The player HUD shows the instance and copies `<origin><path>?shard=N`; opening that link pins the shard on the WebSocket route.
- Lifecycle hooks run with `player.data` bound and are stored outside the remote event registry, so a declared remote event can never reach them.
- `player.data` is bound to the dispatching player, so a script cannot read or write another player's data. Writes are debounced into D1 `player_data` and flushed on disconnect or by a DO alarm.

## Physics Contracts

- `PhysicsWorld.raycast(origin, direction, maxDistance, options?)`: `options.ignoreBodyId` skips the caster and `options.includeTriggers` opts trigger volumes into the query (default off).
- Solver tuning lives on the world: `solverIterations` (velocity passes), `positionIterations` (depth-converging passes), `restitutionThreshold`, `linearSlop`, `maxSubStepDistance`.
- `RigidBody.rotation` is Euler XYZ in radians. A non-zero rotation on a box switches narrowphase to `oriented.ts` (SAT box-box, sphere-OBB, OBB raycast); `setRotation()` refreshes the world AABB.
- `CharacterPhysicsController` probes five ground rays spread by `horizontalRadius * 0.6`, accepts surfaces with `normal.y >= minGroundNormalY` (0.7), and snaps down ledges up to `groundSnapDistance`.

## Advanced Authoring Contracts

- Three new `StudioObjectType` values: `terrain`, `constraint`, `particle`. Payloads live on `obj.terrain` / `obj.constraint` / `obj.particle` and are validated on manifest load.
- Terrain is a column heightfield (`width`/`depth` <= 64, `height` <= 32) with two RLE strings `"value*count,..."` for heights and material indices. `normalizeTerrainData()` rejects malformed or oversized payloads.
- Terrain meshes emit only exposed faces (top, bottom, four walls) with per-face vertex colours; `buildTerrainBodies()` greedy-merges equal-height cells into at most 512 static boxes. Terrain rotation is not applied to colliders.
- Sculpt brushes: `raise`, `lower`, `smooth`, `flatten`, `paint`, `erase`. Each is pure and merged into one undo step via `mergeKey: terrain:<id>`.
- Constraints: `weld`, `hinge`, `spring`, `rope`, `rod`. `PhysicsWorld.addConstraint()` registers with `ConstraintSolver`, which runs once per substep after integration and before contact solving. Body ids resolve raw or with `physics_`/`trigger_` loader prefixes.
- Particle emitters are pooled `THREE.Points`; `AdvancedFeatureRuntime` mounts them in playtest and published play, driven by `WorldAttachment.tick(dt)` on the fixed physics tick.
- `StudioScene.setTerrainBrush()` switches left-drag from camera orbit to sculpting; `setTerrainEditCallback()` reports each brush stroke to the document.

## Code Layout

- `mochi/src/routes/studioRouting.ts` - Studio & Play URL route parsing and link generation
- `mochi/src/App.tsx` - Root routing, tab state, and map view mounting
- `mochi/src/components/studio/templates/studioTemplates.ts` - Pre-configured starter templates
- `mochi/src/components/studio/StudioHub.tsx` - Experience Hub landing container
- `mochi/src/components/studio/StudioHubTemplates.tsx` - Template chooser cards
- `mochi/src/components/studio/StudioHubRecentList.tsx` - Recent experiences / drafts grid
- `mochi/src/components/FriendsBar.tsx` - Social bar with real authenticated user presence
- `mochi/src/pages/StudioPage.tsx` - Editor wiring: document, team, environment and publish state
- `mochi/src/pages/studio/StudioViewport.tsx` - Centre region: builder canvas, animation dock, script tab, publish tab
- `mochi/src/pages/studio/useStudioSavePublish.ts` - Draft save and publish submission round-trips
- `mochi/src/pages/studio/useStudioScriptRunner.ts` - Browser Lua run state for the script tab
- `mochi/src/components/studio/shell/StudioShell.tsx` - Binds the document to the chrome (ribbon, menus, docks, status bar)
- `mochi/src/components/studio/shell/StudioEditorShell.tsx` - Chrome layout with every dock as a slot
- `mochi/src/components/studio/shell/ribbonGroups.tsx` / `ribbonCatalog.tsx` - Per-tab ribbon bodies and the part/brush/gizmo catalogs
- `mochi/src/components/studio/shell/StudioExplorerPanel.tsx` - Service tree with parts nested under Workspace
- `mochi/src/components/studio/shell/StudioPropertiesPanel.tsx` - Properties dock that swaps between service and part schemas
- `mochi/src/components/studio/shell/propertyControls.tsx` / `servicePropertySchema.ts` / `StudioObjectProperties.tsx` - Declarative property grid and its schemas
- `mochi/src/components/studio/shell/StudioOutputPanel.tsx` / `StudioStatusBar.tsx` / `useStudioSystemLog.ts` - Output console, command line and bounded log buffer
- `mochi/src/engine/studio/hierarchy.ts` - Pure parent-chain helpers (`isDescendant`, `childMap`, `rootObjects`)
- `mochi/src/components/studio/Studio3DCanvas.tsx` - Three.js canvas viewport container
- `mochi/src/components/studio/StudioObjectPalette.tsx` - Object palette used by the toolbox Insert tab
- `mochi/src/components/studio/ScriptConsole.tsx` - Lua script editor and console body
- `mochi/src/index.css` - Global CSS custom properties (--studio-*)
- `mochi/tailwind.config.js` - Tailwind theme tokens (colors.studio)
- `mochi/src/components/studio/team/` - Team Create hooks, transport, op helpers and token-only UI
- `mochi/src/api/studioTeam.ts` - Typed Team Create REST SDK and WebSocket URL builder
- `mochi-cloud/src/routes/studioTeam.ts` / `src/do/StudioDraftDO.ts` - REST gateway and live room

## Invariants & Compliance Rules

> Binding standard for every agent and contributor: **`AGENTS.md`**. This section
> is the summary; `AGENTS.md` is authoritative and adds the parallel-work
> protocol, i18n placement rules and the definition of done.

- Single Responsibility Principle (SRP): Every file must remain strictly <= 300 lines of code.
- Zero Unicode emojis across all files (Probe 4B compliance).
- Zero legacy platform brand strings (rebrand compliance).
- 4-locale i18n key parity across en, th, ja, zh.
- Studio UI colours must come exclusively from CSS design tokens (`--studio-*-rgb` / `studio-*` utilities); raw palette utilities are forbidden.
