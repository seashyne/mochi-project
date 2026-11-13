# Platform Roadmap: From Engine Demo to a Platform That Competes

`ROADMAP.md` tracks engine feature adoption (Phases 1-4, all shipped). This file
tracks the other question: what turns a working engine into something a creator
would choose over Roblox.

Every claim about the current state below is verifiable in code, and the numbers
are the ones the code enforces, not estimates.

## 1. The only battleground worth picking

| Battleground | Honest assessment |
| --- | --- |
| Win players away from Roblox | Lost already. Network effects, avatars, economy, their friends are there. |
| Out-feature Roblox for creators | Lost. Ten years of engine, tooling and moderation cannot be caught by adding features. |
| **Be the first place for people who never used Roblox** | Winnable. Game jams, classrooms, brands making interactive 3D, social hangouts shared by link. |

The winnable position rests on two things Roblox cannot copy by shipping a
feature, because they are architectural:

1. **Zero install.** A link opens a playable world. Nothing to download, nothing to
   patch, no store review.
2. **The editor is in the browser and collaborative by construction.** Team Create
   is a mode in Roblox Studio; here the Durable Object is the document.

Non-goal: matching Roblox feature for feature. If a work item only exists to
"catch up", it does not belong in this file.

## 2. Where the platform actually is

Shipped and covered by tests:

| Area | State |
| --- | --- |
| Authoring | 13 placeable types, voxel terrain, materials, GLB import, schema property grid, patch undo/redo, explorer |
| Animation | cubic-bezier easing, crossfade, state graph, Lua `animation.*` |
| Navigation | A* + smoothing, kernel bake with region labels, agent NPCs, reciprocal avoidance |
| Audio | procedural synthesis, `sfx`/`music` buses, distance rolloff, panning, Doppler |
| Multiplayer | `player_state` at 20 Hz, world ops, `transform_delta` for agents and runtime spawns |
| Delivery | manifest v2 + cloud validation, content-addressed assets, third-party notices |

Limits the code enforces today:

| Limit | Value | Where |
| --- | --- | --- |
| Objects per draft | 20,000 | `mochi-cloud/src/do/draftCollabCore.ts` |
| Publish manifest index | 256 KB, 4,096 chunks, 64 MB per chunk | `services/manifestValidation.ts` |
| Assets per game | 4,096 | same |
| Chunk stream radius | 128 m load, 192 m unload | `engine/scene/chunkStream.ts` |
| Frame budget | 1,500 draw calls, 1.5M triangles | `engine/scene/renderBudget.ts` |
| Mesh detail | **no per-mesh cap** - only the frame budget | `engine/assets/modelLoader.ts` |

For comparison, Roblox caps a mesh at 20,000 triangles and streams instances
inside a 1,024-stud (~287 m) target radius. We stream a smaller bubble and cap
nothing at import, which is the worst combination: no guardrail, no headroom.

## 3. The four gates

"Competitive" is not a feeling. These four are the bar, and three of them are not
met today.

| Gate | Test | Status |
| --- | --- | --- |
| G1 Port time | A Roblox developer rebuilds a simple obby in under an hour, in Lua, without reading a manual | Fails: `task.wait` cannot yield, so the loop patterns they know do not work |
| G2 Density | 30 players in one room at 30+ fps on a mid-range laptop | Unknown: never measured |
| G3 Trust | A client that edits its own position is refused by the server | Fails: transforms are first-writer-wins, no arbiter |
| G4 Audio | A creator uploads a sound and hears it positioned in 3D | Fails: synthesis only, no uploaded files |

G2 is unknown, not failing. Measuring it before optimising is the first task.

## 4. Phase 5 - Creator floor

Goal: a Roblox developer can do their normal work here without relearning.

| # | Item | Why it blocks | Done when |
| --- | --- | --- | --- |
| 5.1 | Coroutine scheduler so `task.wait` yields | Every loop pattern from Roblox uses it; today it only schedules a callback | `while true do task.wait(1) ... end` runs and a test proves the script suspends and resumes |
| 5.2 | Import guardrails (triangles, texture size, audio length) | A 500k-triangle GLB loads today and quietly eats the frame budget | An oversized asset is rejected with a message naming the limit and the actual value |
| 5.3 | Uploaded audio | No game ships without its own sound | Upload a file, `world.playSound` plays it with the same rolloff, pan and Doppler as synthesis |
| 5.4 | API parity checklist | Creators discover gaps one at a time, then leave | A table in the docs maps every Roblox call a beginner uses to its equivalent or to a documented "not supported" |

5.1 is the highest value per unit of work in this document: it unlocks the
largest population of creators and it is testable without any UI.

## 5. Phase 6 - Trust

Goal: a multiplayer session where the server is the source of truth.

| # | Item | Done when |
| --- | --- | --- |
| 6.1 | Authoritative player movement with client prediction and correction | A client that teleports itself snaps back within one round trip |
| 6.2 | Server-side ownership for replicated objects (replaces first-writer-wins) | The room assigns owners; a delta from a non-owner is dropped server-side, not client-side |
| 6.3 | World-op validation (bounds, rate, object shape) | A malformed or out-of-bounds spawn is rejected at the edge |
| 6.4 | Baseline anti-cheat (speed, teleport, score sanity) | Documented thresholds, enforced server-side, logged |

Without 6.1 and 6.2, anything competitive (racing, combat, score attack) is
trivially cheatable, so no amount of rendering work matters.

## 6. Phase 7 - Scale

Goal: worlds bigger than one screenful, at frame rate.

| # | Item | Why |
| --- | --- | --- |
| 7.1 | Interest management for transforms | Every peer receives every delta today; `player_state` is already radius-filtered |
| 7.2 | LOD (distance swap or decimation) | 1.5M triangles per frame is the whole budget; one hero model can eat it |
| 7.3 | Occlusion culling | Geometry behind walls is drawn |
| 7.4 | Instance-level streaming | Chunks are all-or-nothing at 64 MB |
| 7.5 | Benchmark harness (30 players, fixed scene) | G2 needs a number before and after every change |

## 7. Phase 8 - Platform

Goal: the parts that need people, money and lawyers, not commits.

- Economy and monetisation (payments, payouts, tax, refunds).
- Moderation pipeline (asset scanning, report queues, age gates).
- Marketplace and UGC licensing.
- Mobile and console builds that have actually been run on devices.

Nothing here starts before Phases 5 and 6 are done: a marketplace on a cheatable
platform is a liability.

## 8. Deliberately out of scope

- Native console clients and store certification.
- Renderer replacement (Forward+/GI/SDFGI): impossible on WebGL2.
- A full Luau type system. Lua compatibility is enough for G1.
- Matching Roblox's avatar economy or its asset library size.

## 9. Risks and unknowns

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| wasmoon may not expose coroutines to the host | 5.1 is the keystone item | Spike it first, with a throwaway test, before planning around it |
| WebGL2 ceiling on low-end mobile | The "opens on any link" promise dies on cheap phones | Measure on a mid-range Android before promising mobile |
| Authoritative simulation cost per room | A Durable Object per room simulating physics may not pay for itself | Model cost per concurrent room before Phase 6 |
| Moderation cost | Platform-scale UGC needs human review | Stay invite-only until Phase 8 is funded |

## 10. Next three actions

1. **Spike coroutines** (5.1): prove wasmoon can suspend and resume a script from
   the host. One test, no product code. If it fails, the fallback is a
   generator-based rewrite of the script runner, which is a different estimate.
2. **Build the benchmark** (7.5): 30 synthetic players, fixed scene, report fps and
   draw calls. G2 must stop being "unknown".
3. **Write the parity checklist** (5.4): it turns "we should support Roblox
   developers" into a finite, ordered list of work.
