# Platform Progress: Phases 5 and 6

Split out of [`PROGRESS.md`](./PROGRESS.md) when that file reached its 300-line
ceiling. Nothing here changed; the roadmap links still point at `PROGRESS.md`, which
now forwards to this file.

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
