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
| 3.2 | Steering and local avoidance (RVO) | `modules/navigation_3d/3d/nav_map*.cpp` | PLANNED |
| 3.3 | Navmesh baking in the Rust/WASM kernel (`npm run build:wasm`) | `nav_mesh_generator_3d.cpp` | BACKLOG |
| 3.4 | Agent component + Lua API (`agent.moveTo`) | `scene/3d/navigation_agent_3d.cpp` | PLANNED |

**3.1 shipped** in `engine/navigation/`: `NavGrid` (byte-per-cell walkability with
world/cell mapping), `findPath` (8-way A*, octile heuristic, binary heap, typed
arrays, corner cutting refused, iteration budget), `smoothPath` /
`lineOfSight` (greedy string pulling with a quarter-cell sampled ray), and
`buildNavGrid` which bakes a grid from `StudioObject[]` — colliding footprints
inflated by an agent radius, pickups and spawns ignored. 30 tests.

3.4's Lua surface shipped early as `player.moveTo(x, z, speed?)` /
`player.stopMoving()` / `player.isMoving()` (`engine/runtime/playerNavigator.ts` +
`runtimeNavigation.ts`, wired in both `gameRuntime` and `playtestRuntime`,
documented in `docs/RUNTIME.md` section 7). An `agent` NPC type is still open.

Next in this phase: 3.2 steering and local avoidance, then 3.4's agent entity.

## Phase 4 - Multiplayer and audio

| # | Item | Godot reference | Status |
| --- | --- | --- | --- |
| 4.1 | Delta state replication with authority per object | `modules/multiplayer/scene_replication_interface.cpp` | BACKLOG |
| 4.2 | 3D audio attenuation, Doppler and bus effects | `scene/3d/audio_stream_player_3d.cpp` | BACKLOG |

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
