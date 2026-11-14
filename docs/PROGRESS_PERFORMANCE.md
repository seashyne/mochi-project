# Platform Progress: Measurement and the Kernel

Split out of [`PROGRESS.md`](./PROGRESS.md) when that file reached its 300-line ceiling.
These are the entries that answer "how fast is it, and is the kernel worth its
complexity": the client benchmark, the kernel audit, and the nav bake rewrite.

**G2 client half instrumented** (2026-11-13): `npm run benchmark:client` loads a fixed
6x6 room world - 36 chunks, 396 objects - in real Chrome and reports what the culling
passes change, measuring the same scene with occlusion on and off.

From inside a room, 24 of 36 chunk targets are occluded: draw calls fall 36 -> 12 and
triangles 4,752 -> 1,584. From an overhead view where nothing can be occluded, draw
calls are unchanged and the pass costs 0.004 ms of test time per frame plus a
0.008 ms rebuild. That is the trade the 7.3 decision needed: it pays where there is
cover and costs about 0.03-0.04 ms of CPU submission where there is none.

The 6x6 room grid is a favourable shape for occlusion - a maze - so -66% is a
ceiling, not a typical number.

What this does not do is report a frame rate. The headless browser rasterises in
software (SwiftShader), so the only honest timing is CPU command submission
(~0.08 ms either way). Draw calls and triangle counts are exact and hardware
independent; G2's "30 fps on a mid-range laptop" still needs a run on real hardware.
This harness is what makes that run comparable.
**Kernel audit** (2026-11-13): `npm run benchmark:kernel` times every kernel path
against the TypeScript it replaced, because "Rust where it pays" had never been
checked against a stopwatch. `docs/KERNEL_AUDIT.md` holds the table.

Three of ten paths went the wrong way. The broadphase AABB test cost 14.2 ns through
the kernel against 8.0 ns inline, once per pair per physics step - now inlined. The
navigation bake is 2.6x to 10.5x slower than TypeScript at every grid size, because
it is a dense pass over every cell while the TypeScript rasteriser only touches cells
a box covers, and it also labels regions. That one is documented rather than reverted:
the labels are what `findPath` uses to refuse a route between disconnected areas.

Compounding it, `sync()` called `setObjects()` on a 250 ms timer with a fresh array
and the grid was thrown away every time, so the world was rebaked several times a
second whether or not anything had moved. `setObjects` now compares the resident
objects and keeps the grid.

`simplify_mesh` (3.9x), `resolve_overlaps` (2.1x) and `scan_json_array` (1.8x) are
real wins. `rasterize_occluders` and `test_occlusion` are level with TypeScript and
are kept for testability and bounded cost, not speed.
**Nav bake fill rewritten** (2026-11-13): the kernel bake was 2.6-10.5x slower than
the TypeScript rasteriser. Measuring with zero blocking boxes showed why: at 512x512,
2.60 ms of the 3.18 ms was the clear plus the region flood fill, not the rasterise.

The fill was a per-cell BFS that recovered coordinates with `%` and `/` - two integer
divisions per cell - and the grid clear was an indexed loop. It is now a scanline
fill, which stacks one seed per horizontal run, with `slice::fill` for the clears.
512x512 went from 3.21 ms to 2.38 ms; the zero-box case shows 1.72 ms of that is
still the region pass itself.

A new test compares the entire partition against a reference flood fill rather than
just counting regions, and it asserts the scene really splits - the first version of
that test passed on a scene that was actually one region, which is exactly the kind
of vacuous green a partition test exists to prevent.

Still open, deliberately: whether regions are worth their cost at all. `findPath`
uses the labels to refuse a route between disconnected areas, so removing them is a
behaviour decision. With bakes now rare, the remaining cost is 0.5 ms at 256x256 and
2.4 ms at 512x512 - a hitch at a chunk boundary, not a per-frame cost.
