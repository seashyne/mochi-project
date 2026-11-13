# Platform Progress

What shipped against `docs/PLATFORM_ROADMAP.md`. The roadmap keeps the plan and its
acceptance criteria; this file keeps the record, so a reader can tell at a glance
which gates are closed and what each change actually delivered.

**5.1 shipped** (2026-11-13): scripts run inside a Lua coroutine, `task.wait`
suspends and the runtime resumes it on a later frame. The two-argument
`task.wait(delay, callback)` form still schedules a callback, so existing scripts
did not break. Semantics and the handler caveat are in `docs/SCRIPTING.md`; the
spike that preceded it confirmed wasmoon can resume a coroutine from the host,
which was the risk this item carried.

**5.2 shipped** (2026-11-13): models and audio are checked at import - triangles,
mesh count, texture edge, file size and audio length - and a breach is refused with
a message naming the limit and the actual value. The binary scans
(`image_dimensions`, `audio_duration_ms`) run in the kernel with TypeScript
references and a parity test; the limits and the holes that remain are in
`docs/ASSET_LIMITS.md`.

**5.3 shipped** (2026-11-13): `world.playSound` accepts an access id, a URL or a
recipe name and routes accordingly. Uploaded files go through the same `prepare()`
as synthesis, so attenuation, panning, Doppler and buses behave identically. Ids
resolve through the existing asset service, which is what keeps a blocked or
unauthorised file from ever producing a URL. `world.loadSound` warms the cache,
because a one-shot cannot wait for a decode.

**6.1 shipped** (2026-11-13): the room validates every player position against
speed, teleport, vertical step, finite values and optional world bounds. A rejected
report is corrected, and the sender gets the verdict back so the local body snaps
within one round trip. The client still simulates physics - this is validation of
outcomes, not replay of inputs - so the remaining half of full authority is
prediction and server-side collision. Gate G3 now passes for blatant cheats; a
cheater inside the allowed envelope can still gain a small advantage.

**6.2 shipped** (2026-11-13): the room owns a `OwnershipTable`. The first peer to
publish an object id claims it; later writes from other peers are dropped at the
edge, removals are owner-only, and a disconnect frees that player's objects. The
client-side channel still applies the same rule locally for responsiveness, but a
modified client can no longer get its delta relayed.

**6.3 and 6.4 shipped** (2026-11-13): the room validates every world edit before
relaying - kind, id, type, finite position/scale/rotation, world bounds, 8 KB
payload ceiling - and caps spawns with a per-player token bucket on top of the
generic rate limiter. Score-shaped replicated state is clamped: non-finite and
negative values become 0, a ceiling is enforced, and a score cannot grow faster
than 10,000 per second. Non-score state passes through untouched. Both budgets are
released when a player disconnects.

**7.5 shipped** (2026-11-13): `npm run benchmark:room` drives 30 synthetic peers
through the real validation chain for 600 ticks (60 s at 10 Hz), 90 transform
entries per tick, with a virtual clock fed to the wall-clock guards so a 20 ms
run is not mistaken for 60 s of starvation. Result: **55,800 accepted, 0 dropped,
0.052 ms median / 0.163 ms p95 per tick** against a 1 ms budget. The p95 ceiling
of 5 ms is a regression tripwire, not an SLA.

This measures the Durable Object, not the browser. Gate G2's frame-rate half is
still open and needs a headless-browser run with a fixed scene; the room is not
the bottleneck at 30 players.

**7.1 shipped** (2026-11-13): `transform_delta` is now delivered per observer
instead of broadcast to the whole room. `do/roomInterest.ts` keeps a spatial hash
of player positions; each entry goes only to players inside the interest radius.
Removals have no position and still go to everyone but the sender. The index is
updated on join and on every accepted `player_state`, and cleared on disconnect.

Decision behind the Engine column: this runs in TypeScript inside the Durable
Object, not the wasm kernel. AGENTS.md section 4 explicitly leaves cloud edge
handlers in JS, and for tens of players a spatial hash is cheaper than a wasm
boundary. `roomGuards.ts` groups the four per-room guards so `GameRoomDO` stays
under the size ceiling. 11 tests cover the index and per-observer delivery.

**7.2 shipped** (2026-11-13): imported models now carry a real decimated level
instead of jumping from full detail to a box. `simplify_mesh` in the kernel clusters
vertices on a uniform grid and represents each cluster by its member closest to the
centroid, so the reduced surface stays on the original geometry and every attribute
(UV, colour) can be read from a real source vertex - averaging a UV across a texture
seam would smear the whole map. Levels are full mesh at 0 m, decimated at 45 m, box
proxy at 120 m, switched by three.js from the render camera.

The grid targets a triangle budget rather than a ratio: a sphere measures 24,320 ->
7,590 triangles, 48,768 -> 8,162 and 97,792 -> 8,706, so a heavier source buys a
bigger saving and the mid level stays around 8k regardless. Skinned meshes,
multi-material meshes, vertex-coloured meshes and morph targets are left at full
detail; a model that cannot shed 20% of its triangles keeps two levels rather than
paying memory for a level nobody sees. The kernel is 44 KB / 11 exports, and
`meshSimplification.ts` keeps the TypeScript reference the parity test compares
against, cell for cell.
**7.3 shipped** (2026-11-13): solid static boxes - blocks, terrain, model colliders -
are rasterised into a 256x144 w-buffer, and any registered target whose screen
rectangle is fully covered by closer geometry is hidden. Every pixel stores 1/w,
which is linear in screen space under perspective; NDC z is not, and interpolating
it orders surfaces wrongly on large faces.

The pass is self-gating and throttled: it does nothing below 16 occluders or 8
targets, and the buffer is only rebuilt when the camera has moved 1.5 m or turned
3 degrees. Measured cost is 1.04 ms per rebuild at 256 boxes, 1.86 ms at 1,024, and
0.019 ms per frame for 40 candidate tests - so the cost lands on movement, not on
every frame.

Boxes straddling the eye plane are skipped rather than clipped. That only loses
occlusion, never invents it. Distance and occlusion each store their own verdict
(`distanceCulled`, `occlusionCulled`) and recompute `visible` from both, so neither
pass can undo the other by writing the flag.

Honest limit: this measures the pass, not a frame-rate win. A batched chunk is one
box, so occlusion rarely hides it; the win is per-model, and a dense indoor scene is
where it would show. `getOcclusionStats()` reports occluders, targets, occluded
count and both timings so a real session can answer whether it pays before anything
else is built on top of it.
**7.4 shipped** (2026-11-13): a chunk payload is `{"chunkId":"...","objects":[...]}`,
so waiting for the whole file meant a multi-megabyte chunk showed nothing until the
last byte landed. Objects now stream into the world as their bytes complete.

`scan_json_array` in the kernel walks the payload tracking strings and escapes - the
characters that break naive scanners - and returns the byte range of every complete
element. It resumes from the last range, so repeated scans over a growing buffer stay
linear instead of rescanning from the start. `streamChunkObjects` reads the response
body, parses each complete element and yields batches.

Batching is bounded by count *and* bytes (64 objects or 384 KB). A count-only batch
was the first version and it was wrong: a payload of heavy objects waited for the
object count to fill, which on a 2 MB chunk is most of the download - the exact wait
streaming exists to remove.

Activation is deliberately narrow. Chunks under 2 MB and chunks already in the asset
cache keep the all-at-once path, because streaming them only adds overhead; a
streamed payload is written back to the cache on completion, since streaming bypasses
it. A truncated payload is safe: the scanner simply reports the elements it has.

Honest limit: each batch is its own `loadWorldFromManifest` call, so a streamed chunk
costs one instanced batch set per flush instead of one per chunk. Only large chunks
take this path, and the objects that make a chunk large are usually scripted, which
means one mesh each anyway.
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
