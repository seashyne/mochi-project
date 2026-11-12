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

### 1. glTF extension handlers — `src/framework/parsers/glb/` (23 files)

**Take:** the `glb/` subtree (accessors, extensions, material and texture
handlers) plus `glb-container-parser.js`. Not the sibling parsers in
`framework/parsers/` — `audio.js`, `text.js`, `ply.js`, `sog.js` and
`sprite-sheet.js` are unrelated to glTF and stay out.

**Measured coupling** (spike, `C:\tmp\pc-spike`): 23 files, 36 references to
modules outside the subtree, and they are almost all `core/math`
(`vec3`, `mat4`, `quat`, `math`), `core/debug`, `scene/constants`,
`platform/graphics/constants` and `core/shape/bounding-box`. That is a small,
finite adapter surface, which is why this item goes first.

**Why first:** `mochi/src/engine/assets/` is only 2 files today, and creator
uploads go through a Draco/Basis pipeline in `public/draco` and `public/basis`.
The handler logic is where the hard-won edge cases live.

**Target:** `mochi/src/engine/vendor/playcanvas/gltf-extensions/`

**Parity test:** `tests/vendor_gltf_parity.test.ts` — load the same GLB with
Three's `GLTFLoader` and the ported handlers, compare material parameters,
texture slots and animation track counts.

**Risk:** medium. Handlers assume a PlayCanvas `Asset` graph. Expect to rewrite
the I/O edges and keep the parsing bodies.

### 2. Animation state graph — `src/framework/anim/` (30 files)

**Take:** `controller/` (state graph, conditions, transitions, layers) and the
blend-weight maths. Skip the component wrapper.

**Why:** `mochi/src/engine/animation/` is 5 files and has no layered blending or
transition conditions. Creator-facing animation authoring is the gap.

**Target:** `mochi/src/engine/vendor/playcanvas/anim-controller/`

**Parity test:** `tests/vendor_anim_parity.test.ts` — drive the same state graph
with the same input sequence and assert identical clip weights per frame.

**Risk:** low. This module is mostly pure maths over a small state model.

### 3. Static batching — `src/scene/batching/` (5 files)

**Take:** the batch grouping heuristic and the merged-geometry builder.

**Why:** draw-call count is the main perf ceiling for creator maps with many
repeated props. Small module, immediate measurable win.

**Target:** `mochi/src/engine/vendor/playcanvas/batching/`

**Parity test:** `tests/vendor_batching_parity.test.ts` — same input mesh set
produces the same group count and identical vertex totals.

**Risk:** low.

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
