# Mochi Roadmap

Status legend: `DONE` shipped and verified, `WIP` in progress this milestone, `PLANNED` agreed but not started, `BACKLOG` candidate.

## Delivered so far

| Area | What shipped | Status |
| --- | --- | --- |
| Studio design system | `--studio-*-rgb` tokens, dark/light themes, object-type identity classes, token-only UI (zero raw palette utilities) | DONE |
| Team Create | D1 grants + sessions, per-draft `StudioDraftDO`, live ops/presence/locks, server-authoritative save, shared drafts, `/revoke` + `resync` | DONE |
| Team Create UI | Panel, presence strip, trigger, Hub shared badge; 4-locale i18n domain `team` | DONE |
| i18n | 4-locale parity (en/th/ja/zh) enforced by tests; `animation` and `team` domains extracted to modules | DONE |
| Deployment | `mochi-cloud-api`, `mochi-web`, `mochi-studio` live; D1 migrations through `0020` | DONE |
| Physics | Rust/WASM kernel, SAT/OBB, spatial hash, joints, substepping, character controller | DONE |
| Scripting | Custom Lua interpreter + server script delivery + remote events | DONE |
| Studio shell | Menu bar, ribbon tabs, docked toolbox/explorer/properties/output, status bar, declarative property grid | DONE |

## Godot adoption strategy

Godot is MIT, so porting is legally fine. The blocker is architectural: Godot is C++ with a native renderer and a scene tree; Mochi is TypeScript + Three.js/WebGL2 + Rust-to-WASM + Lua on Cloudflare. We therefore transfer **designs and algorithms**, never the engine.

| Lane | Meaning |
| --- | --- |
| Borrow design | Re-implement the data model / API shape in TypeScript |
| Port algorithm | Translate a bounded algorithm (prefer Rust/WASM for CPU-heavy work) |
| Never copy | Renderer, Control/Theme UI, GDScript, platform layer, GDExtension |

Reference source lives in `godot-master/godot-master/` (353 MB, keep it out of version control).

## Phase 1 - Editor velocity and memory

| # | Item | Godot reference | Status |
| --- | --- | --- | --- |
| 1.1 | Schema-driven property inspector (`PropertyDescriptor` + per-type registry, generic field renderer) | `editor/inspector/editor_inspector.cpp` | DONE |
| 1.2 | Patch-based undo/redo (store deltas, not full snapshots) | `core/object/undo_redo.cpp` | DONE |

Acceptance: adding a new object type needs only schema entries; undo memory scales with edited objects, not scene size; existing inspector and history behaviour preserved.

## Phase 2 - Animation

| # | Item | Godot reference | Status |
| --- | --- | --- | --- |
| 2.1 | Cubic bezier easing alongside linear/step | `scene/animation/animation.cpp` | DONE |
| 2.2 | Cross-fade blending between clips | `animation_mixer.cpp` | DONE |
| 2.3 | State machine / transition graph | `animation_node_state_machine.cpp` | DONE |

Phase 2 is complete. Notes on what actually shipped:

- **2.1** `engine/animation/bezier.ts` solves CSS-style `cubic-bezier(x1,y1,x2,y2)`
  with Newton-Raphson plus a bisection fallback. `toThreeClip` expands step and
  bezier segments into linear keys, so the runtime plays exactly what the Studio
  sampler shows. This also fixed step easing, which the runtime previously
  ignored (it played every segment as linear).
- **2.2** Uses three's `AnimationMixer.crossFadeTo` rather than porting a blend
  tree; `stateMachineRuntime.ts` owns the fade.
- **2.3** `stateMachine.ts` + `stateMachineRuntime.ts`, driven from Lua via
  `animation.*`, authored in the Studio panel, validated on the server, and
  synced through Team Create.

## Phase 3 - Navigation and AI

| # | Item | Godot reference | Status |
| --- | --- | --- | --- |
| 3.1 | A\* over a grid/graph + path smoothing | `core/math/a_star.cpp` | DONE |
| 3.2 | Steering behaviours: seek, arrive, separation, blocked-lane avoidance | `modules/navigation_3d/3d/nav_map*.cpp` | DONE |
| 3.3 | Nav-grid bake in the Rust/WASM kernel (`npm run build:wasm`) | `nav_mesh_generator_3d.cpp` | DONE |
| 3.4 | Agent component + Lua API (`agent.moveTo`) | `scene/3d/navigation_agent_3d.cpp` | DONE |
| 3.5 | Local avoidance: reciprocal separation in the WASM kernel | `nav_map.cpp` | DONE |
| 3.6 | Polygon navmesh (recast-style convex regions) | `nav_mesh_generator_3d.cpp` | BACKLOG |
| 3.7 | Velocity-obstacle planning (ORCA) | `nav_map.cpp` | BACKLOG |

**3.1 shipped** in `engine/navigation/`: `NavGrid` (byte-per-cell walkability with
world/cell mapping), `findPath` (8-way A*, octile heuristic, binary heap, typed
arrays, corner cutting refused, iteration budget), `smoothPath` /
`lineOfSight` (greedy string pulling with a quarter-cell sampled ray), and
`buildNavGrid` which bakes a grid from `StudioObject[]` — colliding footprints
inflated by an agent radius, pickups and spawns ignored. 30 tests.

The player's Lua surface shipped first as `player.moveTo(x, z, speed?)` /
`player.stopMoving()` / `player.isMoving()` (`engine/runtime/playerNavigator.ts` +
`runtimeNavigation.ts`, wired in both `gameRuntime` and `playtestRuntime`,
documented in `docs/RUNTIME.md` section 7).

**3.4 shipped** as a real object type, not just a Lua surface: `agent` is
placeable from the palette and the ribbon, renders as a capsule, carries no
physics body and never blocks the nav grid. `engine/runtime/runtimeAgents.ts`
keeps one waypoint follower per agent over the player's grid, and Lua drives it
with `agent.moveTo(id, x, z, speed?)` / `stop` / `isMoving` / `position`
(`docs/RUNTIME.md` section 8, example guarded by a test). `script.parent.id` was
added to the node proxy so a script can name the agent it sits on.

**3.2 shipped** as `engine/navigation/steering.ts`: `seek`, `arrive` (deceleration
ramp), `separation` (proximity-weighted repulsion whose magnitude follows the
deepest overlap and never exceeds max speed), `avoidBlocked` (looks ahead on the
grid and nudges along the free side) and `clampSpeed`. Only `arrive` has a
consumer today - `PlayerNavigator` eases into its final waypoint with it.
`separation` and `avoidBlocked` are the primitives 3.5 will call; they are
unit-tested and deliberately unused until local avoidance is worth running.

**3.3 shipped** as `bake_nav_grid` in `mochi-physics-wasm`: one kernel pass that
rasterises inflated footprints into a walkability bitmap *and* labels 4-way
connected walkable regions. `engine/navigation/wasmBake.ts` bridges it, `NavGrid`
carries the labels, and `findPath` now rejects a start/goal pair in different
regions without searching. The TypeScript rasteriser stays as the fallback when
the kernel is not loaded, and a parity test compares the two cell for cell - a
bake that silently disagrees with the renderer is worse than a slow one.

What did **not** ship: a polygon navmesh. Regions are still cells, not convex
polygons, so 3.6 keeps the recast-style generator on the backlog.

**3.5 shipped** as `resolve_overlaps` in the kernel plus a TS reference: every
tick, overlapping agent discs are pushed apart, split by weight, so agents step
around the player and each other instead of sharing space. Movable-vs-movable
pushes are rotated by ~8 degrees (`HEAD_ON_BIAS`), because a centre-line push
between two agents walking at each other is exactly opposite their travel and they
lock at contact distance - found by a test, not by theory.

What did **not** ship: velocity-space planning. Agents slow down only by failing
to advance, and a crowd can shuffle; 3.7 keeps ORCA on the backlog. The
`separation` helper from 3.2 is still the steering-vector form of the same idea and
still has no shipping consumer - the shipped path is the positional resolver.

Next in this phase: nothing blocking. 3.6 and 3.7 are both optimisation work now
that agents walk, avoid and path in shipped code.

## Phase 4 - Multiplayer and audio

| # | Item | Godot reference | Status |
| --- | --- | --- | --- |
| 4.1 | Delta state replication with authority per object | `modules/multiplayer/scene_replication_interface.cpp` | DONE |
| 4.2 | 3D audio attenuation, Doppler and bus effects | `scene/3d/audio_stream_player_3d.cpp` | DONE |
| 4.3 | Transport for `transform_delta` (room event, client + cloud) | `scene_replication_interface.cpp` | DONE |

**4.1 shipped** as `engine/multiplayer/replication.ts`, a transport-free channel:
per-object authority, a delta of only what moved (1 cm / 0.02 rad epsilons,
quantised before the change test), a removal list, and chunking for message size.
`apply` refuses entries for objects the local peer owns, which is what stops two
peers fighting over one transform. Idle peers publish `null` - no packet at all.
`docs/REPLICATION.md` is the contract.

What did **not** ship: the wire. The room protocol has no `transform_delta` event
and `RuntimeNetworkAdapter` carries world ops, not transforms, so the only motion
that actually crosses the network is still `player_state` at 20 Hz. 4.3 keeps the
transport on the backlog rather than pretending 4.1 is end-to-end.

**4.2 shipped** in two halves: `engine/runtime/audioSpatial.ts` holds the maths
(inverse-distance rolloff with a taper at the 34 m limit, stereo pan from the
listener's right vector, Doppler from radial closing speed clamped to an octave),
and `AudioBus` gained `sfx`/`music` buses with independent level and mute, a
stereo panner per positioned sound, and detune from Doppler. The playtest runtime
feeds the follow camera's yaw, so panning matches the view. `docs/AUDIO.md`
records the model and its limits: mono point sources, no occlusion, no reverb, no
looping ambience, nothing streamed from disk.

**4.3 shipped**: `transform_delta` is a real room event end to end. `GameRuntime`
ticks a `ReplicationBridge` at 10 Hz over the agents and runtime spawns it owns,
the adapter hands payloads to `MultiplayerManager`, the Durable Object validates
the shape (`do/transformDelta.ts`) and relays to everyone **but the sender** under
a 20/s bucket, and the receiver applies it to the nodes that resolve. Publishing
claims authority, so an echo or a second writer is refused rather than fought over.
`GameRoomDO` lost its socket fan-out to `do/roomBroadcast.ts` to stay under the
size ceiling.

Limits, documented in `docs/REPLICATION.md`: first writer wins per object (no
server arbiter), position and yaw only, and remote objects snap to each sample -
`MultiplayerManager` interpolates player avatars, not replicated objects.

## Explicitly out of scope

- Renderer replacement (Forward+/GI/SDFGI) - impossible on WebGL2.
- Control/Theme UI system - React + Tailwind is a better fit here.
- GDScript or its parser - the Lua interpreter is the product decision.
- Godot web export as the runtime - 30-40 MB wasm breaks the download budget.
- GDExtension / C# bindings - no native host.

## Engineering rules

- Every file stays `<= 300` lines; new capability ships with tests in the same change.
- Studio UI uses CSS tokens only, and user-facing text goes through the 4-locale dictionaries.
- CPU-heavy ports (navmesh bake, RVO, BVH) go to `mochi-physics-wasm`, not to TypeScript loops.
- Each phase must keep `npm test`, `typecheck`, `lint:lines` and `verify:decoupling` green.
