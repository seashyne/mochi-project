# Platform Progress: Phase 7

Split out of [`PROGRESS.md`](./PROGRESS.md) when that file reached its 300-line
ceiling. Phase 7 is the world-scale work: interest management, LOD, occlusion
culling, chunk streaming and the room benchmark. Nothing here changed; the roadmap
links still point at `PROGRESS.md`, which forwards to this file.

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
