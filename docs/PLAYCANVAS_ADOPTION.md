# PlayCanvas Adoption Plan

Working plan for reusing MIT-licensed PlayCanvas Engine code inside Mochi. The
policy that governs this work lives in `docs/OPEN_SOURCE_POLICY.md`; this file
only covers what to take, in what order, and how to prove it is correct.

Source snapshot: `engine open source/engine-main.zip` (PlayCanvas 2.25.0-beta.3,
commit fb8a353). License: MIT, single copyright holder.

## Ground rules

1. Target directory is `mochi/src/engine/vendor/playcanvas/<module>/`. It is
   excluded from the 300-line ceiling because upstream files must stay verbatim.
2. Every file keeps its original copyright header. No reformatting, no renames
   of upstream symbols, no "cleanup" commits.
3. Each adopted module gets an entry in `VENDORED` inside
   `scripts/gen-notices.mjs` in the same pull request.
4. Each module lands behind a parity test before any existing code is replaced.
5. PlayCanvas modules import PlayCanvas core types (`Mat4`, `Vec3`, `Asset`,
   `EventHandler`, `Color`). None of them are standalone. Every module therefore
   needs a thin adapter, and the adapter is the real work, not the copy.

## What we are not taking

| Module | Why not |
| --- | --- |
| `src/core/math/` | Three.js already provides the math layer; two math types in one bundle is a bug factory |
| `src/framework/physics/` | Mochi has its own Rust/WASM kernel (M10, M11) |
| `src/platform/graphics/` | Three.js owns the WebGL/WebGPU device layer |
| `src/framework/script/` | Mochi has its own Lua interpreter (M9) |
| `src/framework/asset/`, `src/framework/bundle/` | Tied to PlayCanvas' asset registry; porting it means adopting their whole resource model |

## Adoption order

### 1. glTF extensions — measured against three 0.185.1 (DONE, scoped down)

The original plan was to vendor all 22 handlers in `framework/parsers/glb/`.
Measurement killed that: **three's `GLTFLoader` already implements 19 of them**,
including `KHR_texture_transform`, all the `KHR_materials_*` PBR extensions,
`KHR_draco_mesh_compression`, `KHR_texture_basisu`, `EXT_meshopt_compression`
and `EXT_mesh_gpu_instancing`. Porting those would have been pure regression
risk for zero capability gain.

Only three real gaps exist:

| Extension | three 0.185 | Decision |
| --- | --- | --- |
| `KHR_materials_variants` | not implemented (loader links to a third-party plugin) | **Shipped** |
| `KHR_gaussian_splatting` | not implemented | Candidate, needs the renderer work in item 5 |
| `KHR_materials_pbrSpecularGlossiness` | removed from three | Only if legacy creator assets appear |
| `KHR_materials_diffuse_transmission` | not implemented (draft spec) | Skip until ratified |

**Shipped in this pass**

- `mochi/src/engine/vendor/playcanvas/glb/variants.ts` — `createVariantIndex`,
  `readPrimitiveVariants`, `variantNamesByIndex`. Adapted from
  `khr-materials-variants.js`, MIT header preserved, registered in `VENDORED`.
- `mochi/src/engine/assets/materialVariants.ts` — `GLTFMaterialsVariantsExtension`
  (a `GLTFLoaderPlugin`), `applyMaterialVariant`, `listMaterialVariants`,
  `readActiveVariant`. Bindings live on `mesh.userData.mochiMaterialVariants` so
  cloned instances and the Studio inspector read the same shape.
- `mochi/src/engine/assets/modelLoader.ts` — registers the plugin once on the
  shared loader, next to Draco / KTX2 / meshopt.
- `mochi/tests/gltf_material_variants.test.ts` — 17 tests covering the parse
  helpers, binding, swapping, default restore and malformed input.

**Why this one:** creator assets ship one model with several material skins.
Without the extension a creator has to upload a second GLB per colourway, which
costs storage, download and memory. This is the gap that pays for itself.

**What is left from the original item 1:** nothing. The remaining gaps are
covered by items 5 (splatting) and a legacy-asset decision.

### 2. Animation state graph — DONE, written in-house (no code copied)

The plan was to port `framework/anim/controller/`. Measurement changed the
answer again: the hard part of that module is not the state graph, it is the
blend-tree maths, and **three's `AnimationMixer` already crossfades**
(`crossFadeTo`). Porting 25 files to re-derive what the mixer does would have
added a second animation clock next to ours.

What was actually missing was the authoring layer, so it was written directly:

- `mochi/src/engine/animation/stateMachine.ts` — states, parameter-driven
  transitions (`bool` / `number` / `trigger`), priority ordering, `*` (any-state)
  transitions, normalized `exitTime` with loop-wrap handling, transition offset,
  and `validateStateMachine()` for the Studio save path.
- `mochi/src/engine/animation/stateMachineRuntime.ts` — binds the graph to
  `THREE.AnimationMixer`, one action per clip, real crossfade per transition,
  missing-clip tolerance.
- `mochi/tests/animation_state_machine.test.ts` — 25 tests.

**Attribution:** no PlayCanvas code was copied. The semantics follow the same
published model (from/to, priority, conditions, exitTime), which is not
copyrightable, so there is nothing to add to `VENDORED`. PlayCanvas was read as
a design reference only.

**Deliberately not implemented:** interruption sources (a transition always
completes), blend trees / 1D-2D blending (the mixer's crossfade covers the
current need), and layered masks.

**Wiring (done):**

- `engine/animation/stateMachineManifest.ts` — `readAnimationStateMachine()`.
  An absent field is not an error; a broken graph is, and playback falls back to
  plain clips instead of failing.
- `engine/studio/types.ts` (`StudioSceneSnapshot`) and
  `engine/package/manifestV2.ts` (`MochiManifestV2`) gained an optional
  `animationStateMachine` field.
- `engine/scene/attachWorld.ts` — when the graph is present it replaces blanket
  clip playback with a `AnimationStateMachineRuntime`, and the returned
  `WorldAttachment` exposes `setAnimationParameter`, `triggerAnimation` and
  `getAnimationState`. Chunk residency changes rebuild the runtime, same as the
  clip rebind path.
- `tests/animation_state_machine_wiring.test.ts` — 9 tests.

**Lua bindings (done):**

- `runtime/luaNodeApi.ts` — `AnimationBridge` interface and an optional
  `animation` field on `RuntimeApiDeps`. Looked up per call, never captured, so
  the host can attach it after the world loads.
- `runtime/luaGlobals.ts` — `animation.setParameter / setBool / setNumber /
  trigger / getState`. Every call is a no-op when the world has no graph.
- `runtime/gameRuntime.ts` — `setAnimationBridge(bridge | null)`.
- `scene/attachWorld.ts` — exposes the same controls as `animationBridge` on the
  returned `WorldAttachment`.
- `components/PlayerViewport.tsx` — attaches the bridge right after the world
  attaches.
- `tests/lua_animation_binding.test.ts` — 8 tests, including real Lua runs
  through `ScriptContext`.

**wasmoon gotcha:** a JS function cannot return `null` (wasmoon probes `.then`)
and returning `undefined` yields zero Lua values, which breaks `tostring(x)`.
`animation.getState()` therefore returns `''` when there is no state; scripts
compare against the empty string.

**Studio panel (done):**

- `components/studio/animationGraphModel.ts` — pure edits with referential
  cleanup: renaming a state rewrites its transitions and the initial pointer,
  removing a state drops its transitions, removing a parameter drops the
  conditions that read it.
- `components/studio/StudioAnimationGraphPanel.tsx` and
  `StudioAnimationGraphTransitions.tsx` — the panel, rendered under the clip
  editor in the animation view. Optional: it starts behind a create button and
  disables creation until a clip exists.
- `useStudioAnimations` now owns `graph` / `setGraph`, and the value is threaded
  through `StudioSaveTarget`, the draft payload, `buildPublishManifest` and
  `studioDraftsApi.save`, so it reaches the server and the validator.
- `tests/studio_animation_graph.test.tsx` — 18 tests.

Panel colours come from `studio-warning`; the M16 token test rejects raw palette
utilities in studio components, so amber classes are not an option.

**Team Create sync (done):** `animations` and `animationStateMachine` were added
to `SYNCED_MANIFEST_FIELDS`, so they flow through `diffManifestFields` and the
`manifest_patch` op. The Durable Object allowlist now permits both for editors
(never viewers). `useStudioTeamBridge` applies them on draft load and on remote
patches. Clips were not synced live before this change either, so the graph
arrived alongside a fix that was already overdue.

### 3. Static batching — SKIPPED (already covered)

`mochi/src/engine/scene/instancedBatch.ts` already batches repeated primitives
into `THREE.InstancedMesh`, one batch per chunk, with per-instance colour.
PlayCanvas `scene/batching/` merges *different* geometries that share a material,
which only wins when a scene holds many distinct props on one material. Mochi
has no such scene today, and merging would break per-object editing in Studio.
Revisit only if a real map shows a draw-call problem that instancing cannot fix.

### 4. Lightmap baking — `src/framework/lightmapper/` (8 files)

**Take:** the bake loop and the UV2 atlas packing.

**Why:** static terrain and props currently re-light every frame. Baking moves
that cost to author time, which fits the Studio-first model.

**Target:** `mochi/src/engine/vendor/playcanvas/lightmapper/`

**Parity test:** visual, plus a numeric check that atlas utilisation stays above
the current baseline. Needs a fixture scene.

**Risk:** medium-high. Depends on their renderer abstractions; likely the largest
adapter of the four.

### 5. Gaussian splatting — `src/scene/gsplat/` (16 files), optional

**Take:** the splat renderer and sorter.

**Why:** a differentiating feature for scanned environments. Not required for
launch, so it sits last and only runs if 1-4 land cleanly.

**Target:** `mochi/src/engine/vendor/playcanvas/gsplat/`

**Risk:** high. Deep renderer coupling.

## Sequencing

```
glTF handlers ──> batching ──> lightmapper
      │
      └──> anim controller (independent, can run in parallel)
                              gsplat (only after 1-4 are stable)
```

Items 1 and 2 are independent and touch different directories. Items 3 and 4
both need the adapter layer that item 1 establishes, so they follow it.

## Adapter layer

`mochi/src/engine/vendor/playcanvas/adapter.ts` — the only file we author, and
the only file not copied from upstream. It maps the PlayCanvas types the
vendored modules touch onto Three.js equivalents:

- `Vec3`/`Quat`/`Mat4` <-> `THREE.Vector3`/`Quaternion`/`Matrix4`
- `Color` <-> `THREE.Color`
- `EventHandler` -> a small emitter
- `Asset` -> our own asset descriptor from `mochi/src/engine/assets/`

Keep it minimal: if a vendored module pulls in something that is not in the
adapter, that is a signal the module is too coupled and should be narrowed.

## Definition of done per module

- [ ] Files copied with headers intact into `vendor/playcanvas/<module>/`
- [ ] `VENDORED` entry added, `npm run notices` regenerated
- [ ] Parity test passing against the existing implementation
- [ ] Bundle-size delta measured and recorded in the pull request
- [ ] No new runtime dependency added to `package.json`

## Open decisions

- Whether item 5 (splatting) is in scope for launch at all.
- Whether the adapter is allowed to grow beyond type mapping. Current answer:
  no. Anything more means we are porting PlayCanvas, not borrowing from it.
