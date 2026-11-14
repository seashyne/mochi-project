# Platform Progress

What shipped against `docs/PLATFORM_ROADMAP.md`. The roadmap keeps the plan and its
acceptance criteria; this file keeps the record, so a reader can tell at a glance
which gates are closed and what each change actually delivered.

**5.1-5.3 and 6.1-6.4 shipped** (2026-11-13): the creator floor and the trust work -
coroutine scheduling, import guardrails, uploaded audio, authoritative movement,
object ownership, world-op validation and anti-cheat. Detail moved to
[`PROGRESS_PHASES_5_6.md`](./PROGRESS_PHASES_5_6.md) when this file hit its ceiling.

**7.1-7.5 shipped** (2026-11-13): the world-scale phase - per-observer transform
deltas, LOD decimation, occlusion culling, chunk streaming and the 30-peer room
benchmark. Detail moved to [`PROGRESS_PHASES_7.md`](./PROGRESS_PHASES_7.md) when this
file hit its ceiling.

**G2, kernel audit and nav bake** (2026-11-13): the client benchmark, the audit of what
Rust actually buys, and the nav bake rewrite. Detail moved to
[`PROGRESS_PERFORMANCE.md`](./PROGRESS_PERFORMANCE.md) when this file hit its ceiling.

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
**Material names take an enum shape** (2026-11-13): the first version of the alias table
took a plain string, and a typo in that string was silently ignored - the part kept its
old surface and nothing said why. That is the failure mode a typed API exists to prevent.

The obvious fix - an `Enum.Material` of objects - does not survive this host. A Lua table
returned through the JavaScript boundary loses its identity, so `part.Material` could
never compare equal to `Enum.Material.Grass`, and a table does not compare to a string
either. Both were measured before choosing.

So `Enum.Material` is a table of names whose values are the names themselves. That keeps
both properties that matter: a misspelled member is `nil`, and assigning it raises
instead of clearing the property; and `part.Material == Enum.Material.Grass` is true
because both sides are the same string.

The set is the full 43 names a ported script might use, mapped onto the thirteen bundled
PBR sets with everything else degrading to a sensible shading mode - a script that asks
for asphalt gets concrete rather than an error. The prelude list is hard-coded so a typo
is a nil index, and a test compares it against the alias table so the two cannot drift.

Plain strings are still accepted, because scripts often read a material from a config. An
unknown string warns once and leaves the part alone.
**TweenService and the service layer** (2026-11-14): nothing answered to
`RunService.Heartbeat` or `TweenService`, which between them are how a ported script
moves anything smoothly and how it runs something every frame.

`Heartbeat` and `RenderStepped` alias the node update handler, which already fires once
per frame with the delta. They cannot be a spawned loop: `task.spawn` schedules a timer
on the main thread, where `task.wait` cannot yield, so a loop written that way would
spin forever and freeze the session.

`TweenService` drives every tween in a script from one shared frame handler instead of
one per tween. `onUpdate.Connect` returns no connection to disconnect with, so a
per-tween handler could never be removed and a game that opened a thousand doors would
carry a thousand dead closures; one driver keeps that bounded whatever a script does.

Two interop facts shaped the implementation, both measured rather than assumed.
`Vector3` and `Color3` reach Lua as userdata, so a `type(value) == "table"` test misses
them and the tween silently jumps to its target. And a CFrame read off a part is
userdata too - it carries `x`, `y` and `z` like a vector, and a method call on userdata
does not pass its arguments the way a table method does. The tween rebuilds it as a real
Lua CFrame from its fields before lerping, which is what makes `:Lerp` work on it.
**Tween playback state, and a duplicate easing block removed** (2026-11-14): a tween
could be started and cancelled and nothing else. A script that wanted to know whether
its tween was still running had to keep its own flag, which drifts the moment anything
else cancels the tween.

`tween.PlaybackState` now reports Begin, Delayed, Playing, Paused, Completed or
Cancelled, with `Pause` and `Resume` behind it - `state` was already the driver's single
source of truth, so the change was to expose it under the name a script reads instead of
keeping a parallel boolean.

`TweenService:GetValue(alpha, style, direction)` returns the curve on its own, clamped.
It is the same function the driver uses, so a value checked before committing to a tween
matches what the tween will do.

The merge that split the service prelude left the easing block in the tween file twice:
once through the interpolation and once inline, 63 identical lines with the second
shadowing the first. Removing the copy is what made room for the above.
**world:Raycast** (2026-11-14): the physics world has cast rays since the character
controller needed ground checks, but nothing exposed it to scripts. Line of sight,
aiming, placement previews and "is anything between me and that" had no answer.

`world:Raycast(origin, direction, ignore?)` returns the part, the point, the normal and
the distance, or nil. The direction's length is the reach, which is the spelling a ported
script already uses, and the optional third argument is the part to pass through.

The node lookup lives on `RuntimeWorld` because that registry owns the body-to-node map;
a caller holding only the physics world could cast the ray but could not name what it
hit. The proxy builder is passed in rather than imported, so `luaRaycast` and
`luaNodeApi` do not import each other.
**CFrame:Lerp rotates on the sphere** (2026-11-14): the method blended the nine matrix
components, which is only right when the two rotations are nearly identical. Halfway
through a 180 degree turn every component lands on zero - measured, not assumed - so the
basis collapses and the part disappears at the midpoint. Halfway through 90 degrees the
basis is short of unit length, so the part visibly shrinks and grows on the way.

A tween of a CFrame inherited all of it, which is what made this worth fixing rather than
noting: `TweenService` sends every CFrame goal through `Lerp`.

Rotation now converts to a quaternion, slerps along the shortest arc, and converts back.
The two endpoints are returned untouched, and the near-identical case falls back to a
normalised blend so a tiny turn does not divide by a sine near zero.

The maths lives in `luaPreludeRotation.ts` because the prelude is at its ceiling; the
function is a global so the CFrame block, in another module, can call it.
**TweenService completes** (2026-11-14): two things were missing against the API it
mirrors. `SmoothDamp` - the critically damped spring for something that follows a moving
target every frame, a camera being the usual one - did not exist at all. And two tweens
on the same property fought: both wrote every frame and the property landed wherever the
last writer put it, which is neither of the values the script asked for.

`SmoothDamp` takes a number or a Vector3 and returns the new value and the velocity to
feed back next frame; the velocity is what makes the motion continuous instead of
restarting from rest each time. A CFrame is rejected out loud rather than being treated
as a Vector3 - it carries x, y and z, so a silent fallback would damp the position and
leave the rotation alone, which looks like the feature working.

Starting a tween now cancels any running tween on the same instance that shares a
property, which is the rule the platform documents.

Still absent, and stated rather than implied: tweening a GUI object (the HUD is a store,
not an instance tree), `NumberSequence` / `ColorSequence`, and Model pivots.
**Tweening a GUI object** (2026-11-14): the tween blended a fixed list of keys - x, y, z,
r, g, b - which covered Vector3 and Color3 and silently missed everything else. A UDim2
is four numbers under different names, so a GUI size tween did not interpolate at all: it
sat at the old value and jumped to the new one at the end.

Blending now walks whatever numeric fields the two values share, so UDim, UDim2, Vector2
and Color3 all work without a branch per type. Userdata cannot be walked, so the value
types the runtime hands to a script are read by name from one list; a Lua table is walked
directly.

Three tests cover it through a real GUI instance: a frame grows through the middle, the
axis it is not tweening stays put, and it lands exactly on the target.
