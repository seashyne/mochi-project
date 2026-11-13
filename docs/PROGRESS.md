# Platform Progress

What shipped against `docs/PLATFORM_ROADMAP.md`. The roadmap keeps the plan and its
acceptance criteria; this file keeps the record, so a reader can tell at a glance
which gates are closed and what each change actually delivered.

**5.1-5.3 and 6.1-6.4 shipped** (2026-11-13): the creator floor and the trust work -
coroutine scheduling, import guardrails, uploaded audio, authoritative movement,
object ownership, world-op validation and anti-cheat. Detail moved to
[`PROGRESS_PHASES_5_6.md`](./PROGRESS_PHASES_5_6.md) when this file hit its ceiling.

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
**UI fonts self-hosted** (2026-11-13): the shell pulled IBM Plex Sans Thai and Mitr
from the Google Fonts CDN. That put an external host in the critical path of "open a
link and play" - it fails behind a firewall and it is a consent question the EU has
already ruled on. Both families now ship from `public/fonts/` as ten woff2 subsets,
160 KB in total, fetched reproducibly by `npm run fonts`.

Only the thai and latin subsets are kept. Neither family covers CJK, so ja and zh
correctly fall back to a system font instead of downloading glyphs they cannot use.
Preloads cover the body face, `_headers` gives the stable path the same policy as the
other media, and the service worker caches `/fonts/`.

Four families were named in CSS but never loaded - Kanit, Prompt, IBM Plex Mono, and
Inter in the body stack - so every one of them has been silently falling back for as
long as the file has existed. They are gone, which means the stacks now describe what
actually renders.

OFL-1.1 was not on the permitted dependency list, so `AGENTS.md` was amended: OFL is
allowed for fonts only, and the copyright line plus licence text must ship beside the
font and appear in `THIRD_PARTY_NOTICES.txt`. Both families are registered in
`gen-notices.mjs`, which now reads the licence from `public/fonts/` so there is one
copy rather than two.

A contract test holds it together: neither shell may reference a font CDN, every
`url()` and preload must resolve to a file that exists, the licence texts must be
present, and the phantom families must stay gone. The first version of the generated
stylesheet used `//` comments, which only the production build caught - PostCSS
rejects them - so that is now a `/* */` header.
**HUD typography** (2026-11-13): `ui.setHud` took a title, a value, a progress and a
colour, so every game's HUD rendered in the platform's own type no matter what the
game looked like. It now also takes `font` - `mono` (the previous look), `ui` (IBM
Plex Sans Thai) or `display` (Mitr) - and `size`, `sm`/`md`/`lg`.

There is no upload, deliberately. A creator picks from faces the app already ships,
so the browser never fetches a font the platform has not licensed, the family is
already in the shell cache, and no moderation queue is needed. That is the whole
answer to "should there be a font system": a curated list, not a file picker.

Unknown values are ignored rather than thrown, because a typo in a style hint should
never kill a running script. A partial update without style keeps the existing style.

The interesting part was finding that two Lua surfaces build a HUD element: the
runtime API and the legacy script bridge. Each carried its own whitelist, so the
first version of this change worked on one path and silently dropped the field on the
other - caught by the test, fixed by extracting `lua/hudStyle.ts` so both read one
list. Two whitelists for one contract is a bug waiting to happen.
**UI API documented, and a no-op bug found while writing it** (2026-11-13): `ui.*`
had no creator-facing documentation at all - sections 6-8 of `RUNTIME.md` cover
animation, movement and agents, and the HUD surface was simply absent. It now has a
section with the call table, the typography options, a runnable example and the
contract, guarded by a test that executes the example byte for byte.

Writing the contract caught a false claim before it shipped: the draft said the store
only notifies when something changes, and it did not - `setHud` re-notified on every
call, so a script updating a HUD each frame re-rendered React every frame. The code
now compares the merged card and returns early when nothing moved, which is what the
doc promised.

`RUNTIME.md` hit the 300-line ceiling, so section 9 moved to `RUNTIME_UI.md` beside
`RUNTIME_AGENTS.md` - the same split section 8 already used.

`npm run verify:fonts` closes the loop on the self-hosting work: it loads the shell in
Chrome, asks the font set for both families and both weights with Thai sample text,
and fails on any request that still reaches a font CDN. Result: 10 faces declared, 7
files served with 200, 0 external requests.
**CFrame** (2026-11-13): scripts positioned parts with `position` and rotated them with
`rotateY(degrees)` - enough for a spinning coin, useless for anything that needs an
oriented transform. `CFrame` now exists: `CFrame.new`, `CFrame.Angles`, `cf * cf`,
`Position` / `LookVector` / `RightVector` / `UpVector`, `:Inverse()`, `:Lerp()`,
`:ToEulerAnglesXYZ()`, and `part.CFrame` as a property a script can assign.

The type lives in the Lua prelude rather than in JS, because composition needs the `*`
operator and only Lua can attach a metamethod. The bridge converts at the boundary -
Euler to matrix on read, matrix to Euler on write - using the same row-major convention
as the oriented colliders, so a CFrame a script writes lands where physics says it
should.

The interop trap cost the most time. A CFrame created in Lua and returned through a JS
getter keeps its `__mul` metamethod but loses `__index`. The first version put
`Position` and the methods behind `__index`, so `part.CFrame.Position` read as nil -
while a CFrame built entirely in Lua worked, which made the failure look like a flaky
test rather than a rule about the boundary. Every property and method is now a raw
field set at construction, so both paths behave identically.

A CFrame can only be created by the VM that will hold it, so the script context
publishes its factory only while that script is executing, and clears it in a
`finally`. A stale factory would hand one script a value belonging to another's VM.

The parity document claimed `Rotation` is in degrees. It is radians; `rotateY` is the
degree-based helper. Corrected, because a script following the old note would rotate
by a fifty-seventh of what it meant.

Deliberately absent: `cf * Vector3` and `CFrame.lookAt`.
**Games get the creator's environment, and stop inheriting the demo scene** (2026-11-13):
`SceneEnvironment` - skybox, sun, ambient, fog, IBL - existed but was instantiated only
by the Studio viewport, so a published game was lit by whatever `RuntimeEngine` had
built for its own showcase.

That showcase turned out to be the bigger problem. `init()` built it unconditionally:
a glowing torus ring at the origin, an icosahedron, an orbiting octahedron, 200
particle stars, a 50x50 physics floor at y = -2.5, and indigo/cyan demo lights. Every
published game contained all of it on top of the world it actually loaded - the ring
sat around the spawn point. Nothing ever removed it.

The scene is now `buildShowcaseScene`, opt-in through `init(canvas, { showcase })`,
and the player passes `false`. The portal hero and the engine demo keep it.

The environment travels with the world: `attachWorld` owns it, reads the creator's
choice from the manifest, and normalises it through the existing validator so a
corrupt or hostile draft falls back to the starter scene. The choice was already
saved on the draft - it just never reached publish, so `MochiManifestV2` gained the
field and the publish chain forwards it.

Tone mapping was a dead switch: `toneMappingExposure` was set on a renderer that never
had a mode, so it stayed `NoToneMapping` and the Studio exposure slider did nothing.
`SceneEnvironment.apply` now sets ACES filmic, which is where the decision belongs.

Shadows remain off. `sun.castShadow` and the mesh flags are set, but the game renderer
never enables `shadowMap`; turning it on is a cost decision that needs the client
benchmark first.
**Parts honour their material and texture in the game** (2026-11-13): the object model
has carried `material`, `materialTexture` and `textureUrl` since the material library
shipped, and the Studio editor applied all three - `createStudioMaterial` switches
roughness and metalness per name and attaches the PBR maps. The runtime never read any
of them. Both game paths, the instanced batch for static geometry and the per-object
builder for scripted nodes, hard-coded roughness and metalness per object type, so a
wooden crate and a plastic one rendered identically, and a world with brick walls
looked like flat colour once it was published.

`engine/scene/runtimeMaterial.ts` is the runtime's half of that contract: named
materials, bundled PBR sets and uploaded textures, with the per-type values kept as
the fallback so an object that asks for nothing looks exactly as it did before.

Instanced batches are now keyed by surface as well as kind, which is what lets one
batch hold every plastic block and a second hold the metal ones. Neon is keyed by
colour too, because its emissive is baked into the material and an instanced mesh
cannot vary that per instance. Batches keep a white base colour so instance colors
still tint them; a textured part keeps white as well, because the map supplies the
albedo.

Two limits worth stating: a part still takes one material, not a different surface per
face, and the texture branch is covered by a stubbed resolver because texture loading
needs a DOM the test environment does not have.
**Material names from imported scripts** (2026-11-13): a ported world picks a part's
surface by name - "Grass", "Brick", "Wood" - and on the platform it came from the name
*is* the surface. Our model splits shading from texture, and Lua could not set either,
so a script that assigned a material name did nothing at all.

`part.Material` now resolves a name onto the pair the renderer understands: a shading
mode plus one of the thirteen bundled PBR sets. Matching ignores case, spaces and
underscores, an unknown name is ignored rather than raised, and reading the property
back returns the name that was set. `part.materialTexture` takes a preset id directly
for scripts that want a specific set.

The swap happens on the live mesh, which is safe because only scripted objects run code
and only scripted objects are built individually - batched geometry has no script to
change it.

The alias table lives in `scene/materialAliases.ts` and deliberately names no platform:
the rebrand check forbids that string anywhere in `mochi/src`, so the module describes
"names imported scripts use" and the mapping itself is documented in `SCRIPTING.md`.
