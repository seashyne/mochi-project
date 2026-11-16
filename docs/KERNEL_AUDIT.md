# Kernel Audit: What Rust Actually Buys

`AGENTS.md` says CPU-bound work belongs in the wasm kernel. This file checks that
claim against measurement instead of intent: every kernel path is timed against the
TypeScript implementation it replaced, on the same data, in the same process.

Reproduce with `npm run benchmark:kernel` (2026-11-13).

## Measured

| Path | Kernel | TypeScript | Ratio | Called |
| --- | --- | --- | --- | --- |
| `test_aabb_aabb`, 1 call | 14.2 ns | 8.0 ns | **1.77x slower** | per broadphase pair, per step |
| `resolve_overlaps`, 64 bodies | 0.04 ms | 0.09 ms | 2.1x faster | per tick |
| `simplify_mesh`, 12k triangles | 0.81 ms | 3.17 ms | 3.9x faster | once per model load |
| `rasterize_occluders`, 256 boxes | 0.96 ms | 1.04 ms | 1.08x faster | on camera move |
| `test_occlusion`, 36 boxes | 0.008 ms | 0.008 ms | level | every frame |
| `scan_json_array`, 400 objects | 0.03 ms | 0.05 ms | 1.8x faster | per network chunk |
| `bake_nav_grid`, 64x64 | 0.15 ms | 0.10 ms | **1.6x slower** | per world change |
| `bake_nav_grid`, 128x128 | 0.15 ms | 0.03 ms | **5.3x slower** | per world change |
| `bake_nav_grid`, 256x256 | 0.50 ms | 0.11 ms | **4.7x slower** | per world change |
| `bake_nav_grid`, 512x512 | 2.38 ms | 0.28 ms | **8.4x slower** | per world change |
| `bake_nav_grid`, 512x512, no boxes | 1.72 ms | 0.06 ms | clear + fill only | isolates the region pass |
| `decompose_navmesh`, 256x256 | 0.53 ms | 1.36 ms | 2.6x faster | per bake, once per world change |
| `orca_solve`, 32 bodies | 0.01 ms | 0.03 ms | 2.3x faster | per tick with 32 NPCs |

## What earns its keep

`simplify_mesh`, `resolve_overlaps` and `scan_json_array` are genuine wins of 2-4x,
and all three share a shape: **one call does O(n) or worse work over a whole buffer**.
That is the case the boundary cannot spoil. `decompose_navmesh` (2.6x) and
`orca_solve` (2.3x) were added to this table after 3.6 and 3.7 shipped, and they fit
the same shape: a full-grid scan, and an O(n^2) pair pass.

## What is level

`rasterize_occluders` and `test_occlusion` are within noise of the TypeScript
reference. They are not a speed argument and should not be sold as one. They exist
because the algorithm is testable in isolation and because the pass is throttled to
camera movement, so its cost is bounded either way. Moving them back to TypeScript
would be a defensible cleanup, not a regression fix.

## What is slower than the code it replaced

### `test_aabb_aabb` in the broadphase

14.2 ns through the kernel against 8.0 ns inline - the call boundary costs more than
the four comparisons it performs. It was called once per broadphase pair, per physics
step, in the innermost loop of the solver.

**Fixed**: `ColliderUtils.testAABBOverlap` now compares inline. The kernel export
stays, covered by its contract test, but nothing in the product calls it per pair.

### The navigation bake

2.6x to 10.5x slower than TypeScript at every grid size, and the gap widens with the
grid. Two causes, and only one of them is a fair comparison:

1. The kernel path also labels connected regions (a flood fill). The TypeScript path
   never does this, so it is not the same amount of work.
2. The kernel is a **dense** pass - clear every cell, mark blocked cells, flood fill,
   copy out - while the TypeScript rasteriser is **sparse**: it only touches the cells
   a box actually covers. At 512x512 the kernel touches 262,144 cells where TypeScript
   touches roughly the blocked area.

So the honest statement is: the bake buys region labels, and pays 2-8x for them. It
is not the speed win the roadmap recorded when 3.3 shipped.

Two things were done about it. The fill was rewritten as a scanline fill - the
previous version pushed every cell and recovered its coordinates with `%` and `/`,
two integer divisions per cell, and the clears were an indexed loop where a slice
`fill` compiles to a memset. That took 512x512 from 3.21 ms to 2.38 ms, and the
zero-box case shows the rest is the region pass itself: 1.72 ms of the 2.38 ms is
clear plus flood fill. A new test compares the whole partition against a reference
flood fill, not just the number of regions.

Compounding it, `GameRuntime.sync()` calls `navigation.setObjects()` on a 250 ms
timer with a freshly built array, and `setObjects` unconditionally threw the baked
grid away. The world was being rebaked several times a second whether or not anything
had moved.

**Fixed**: `setObjects` now compares the resident objects themselves and keeps the
grid when they are unchanged, and `createRuntimeNavigation` now opts out of dense
per-cell region labels (`includeRegions: false`), using the sparse TypeScript
rasteriser (~0.22 ms at 512x512) alongside WASM `decompose_navmesh` (~0.57 ms at
256x256). Because `findWaypoints` returns `null` directly when `findNavMeshPath`
finds no portal route between islands, disconnected targets are rejected without
per-cell flood-fill labels. `buildNavGrid` still keeps `includeRegions: true` by
default (with an O(1)-logic single-region shortcut for 0-box scenes) so explicit
region queries and kernel parity tests continue to exercise `bake_nav_grid`.

## Test-only exports

`vec3_length`, `vec3_distance` and `resolve_character_box_collision` have no product
call site; they are exercised only by `tests/wasm_physics.test.ts`, which is a
legitimate check that the kernel export loads and computes. `vec3_dot`,
`test_sphere_sphere`, `integrate_body` and `ray_intersect_aabb` are not even wrapped
in the bridge. None of them should be counted as performance work.

## The rule, corrected

"CPU-bound work belongs in the kernel" is true for bulk passes and false for scalar
maths. The boundary costs roughly 6 ns per call; a function whose own body is cheaper
than that loses by moving. The working test:

- **Move it** if one call does O(n) work over a buffer, or the work is per-pixel,
  per-cell, per-triangle or per-object.
- **Leave it** if the caller is a tight loop over single values - broadphase overlap,
  vector length, a dot product.
- **Measure it** either way. Three of the ten paths above went the wrong direction,
  and none of them were obvious before timing.
