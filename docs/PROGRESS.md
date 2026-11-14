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

**Creator surface work** (2026-11-13 to 14): fonts, HUD typography, the `ui.*` API,
CFrame, the creator's environment, materials and textures, tweening, raycasting, and the
class checks. Detail moved to [`PROGRESS_CREATOR.md`](./PROGRESS_CREATOR.md) when this
file hit its ceiling.

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
**IsA answers the class a part really is** (2026-11-14): the method compared the object's
raw type against the name, so `part:IsA("Part")` was false for a block - the type is
"block", the name asked for "Part". A ported script that guards with
`if child:IsA("BasePart")` therefore skipped every part in the world, which reads as the
script doing nothing at all.

The class each object answers to is now a small table: parts are `Part`, `BasePart`,
`PVInstance` and `Instance`; an agent and a model are `Model`; terrain is `Terrain`; a
constraint is a `Constraint`. Names are matched case- and punctuation-insensitively.

`FindFirstChild` gained its second argument. The recursive form searches descendants,
which is how a script reaches into a model without walking it by hand, and
`FindFirstChildOfClass` was added beside it.

The search itself lives in `nodeClasses.ts` rather than the node API, which is at its
line ceiling.
**Tween audit: an endless loop that ended, and a typo that passed** (2026-11-14): two
faults in the same class the rest of this week has been about - something accepted, then
quietly not done.

`TweenInfo.new(time, style, direction, -1)` means repeat forever. The cycle count clamped
a negative count to zero before adding one, so an endless loop played exactly once and
reported Completed. The test for it distinguishes the two behaviours rather than checking
a value that both of them produce: at one and a half cycles the part is at 5, not at 10.

A goal key naming a property the object does not have was skipped without a word. The
tween ran, wrote nothing for that key, and reported success - the same shape as a
misspelled material name. It now warns once per key and still runs the valid half.

The test file that grew past its ceiling split by concern: the playback-state tests stay,
the TweenInfo edges moved to their own file.
