# TEST_READY: Mochi Studio Revamp & Experience Hub E2E Verification

Test Suite Readiness Report for Mochi Studio Revamp, Experience Hub, Dark Theming,
Map ID Routing, and Social State Cleanup.

Date: 2026-11-09T10:37:00Z
Author: teamwork_test_writer_e2e_v3 (E2E Test Writer)
Parent Orchestrator: f815ceb6-c377-47a9-8766-a5c7f15be81b
Status: READY - 100% Tests Executable & Passing

---

## 1. Test Execution Commands

To execute the complete E2E test suite:

### Direct Targeted Run (Experience Hub & Map Routing)
```bash
cd mochi
npx vitest run tests/e2e_experience_hub.test.ts tests/e2e_map_routing.test.ts
```

### Full Frontend Test Suite
```bash
cd mochi
npm test
```

### Full Repository Workspaces Test Suite
```bash
npm test
```

---

## 2. Four-Tier Coverage Summary Table

| Tier | Focus Scope | Target Feature | Test File | Test Count | Pass Rate | Status |
|---|---|---|---|---|---|---|
| Tier 1 | Feature Coverage | F1: Studio Hub Landing View | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 1 | Feature Coverage | F2: Starter Templates (Baseplate, Terrain, Obby) | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 1 | Feature Coverage | F3: User Drafts List (studioDraftsApi) | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 1 | Feature Coverage | F5: Eye-Friendly Dark Tokens (#1e1e24) | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 1 | Feature Coverage | F6: Social Presence Mock Removal | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 1 | Feature Coverage | F4: Map ID Routing (/studio/:mapId, /play/:mapId) | e2e_map_routing.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B1: Studio Hub Empty & Error States | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B2: Missing Auth Tokens & Guest Flow | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B3: Draft 64KB Ceiling & JSON Boundary | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B4: Dark Luminance & WCAG Contrast Safety | e2e_experience_hub.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B5: Malformed MapId & Path Traversal | e2e_map_routing.test.ts | 5 | 100% (5/5) | PASS |
| Tier 2 | Boundary & Corners | B6: Clean State Isolation & Bleed Prevention | e2e_map_routing.test.ts | 5 | 100% (5/5) | PASS |
| Tier 3 | Cross-Feature | Pairwise Interactions (Hub, Route, Session, Theme) | e2e_map_routing.test.ts | 6 | 100% (6/6) | PASS |
| Tier 4 | Real Scenarios | End-to-End Creator & Player Journeys | e2e_map_routing.test.ts | 5 | 100% (5/5) | PASS |
| Total | Tiers 1 to 4 | Comprehensive Experience Hub Suite | 2 Files | 71 | 100% (71/71) | PASS |

---

## 3. Feature Verification Checklist

### F1: Studio Hub Landing View (Requirement R1)
- [x] T1_F1_01: Resolves /studio pathname as Hub landing view instead of directly mounting 3D canvas
- [x] T1_F1_02: Renders template chooser cards section with at least 3 pre-configured options
- [x] T1_F1_03: Structures recent user experiences grid layout fetched from drafts API
- [x] T1_F1_04: Action triggers initialize new blank experience with unique map identifier
- [x] T1_F1_05: Hub landing view does not instantiate WebGL contexts before entering editor
- [x] T2_B1_01: Dedicated empty state displays when creator has zero saved drafts
- [x] T2_B1_02: Network failure during drafts fetch provides retry trigger without UI freeze
- [x] T2_B1_05: Rapid double-clicks on template chooser card debounce project creation

### F2: Starter Templates (Requirement R1)
- [x] T1_F2_01: Baseplate template defines 64x64 grid platform, spawn point, and starter script
- [x] T1_F2_02: Flat Terrain template defines expansive 80x80 platform and scenic elements
- [x] T1_F2_03: Obby template defines obstacle course with start, hazard lava, and goal
- [x] T1_F2_04: Starter templates serialize into valid manifests strictly <= 64KB ceiling
- [x] T1_F2_05: Starter templates include valid starter script code

### F3: User Drafts List & Persistence (Requirement R1)
- [x] T1_F3_01: listMine queries creator drafts with optional auth token
- [x] T1_F3_02: save payload packages objects, scriptCode, and version into manifest JSON
- [x] T1_F3_03: get retrieves single draft by identifier with ownership enforcement
- [x] T1_F3_04: delete removes draft and returns confirmation
- [x] T1_F3_05: save supports autosave flag and version numbers
- [x] T2_B3_01: Manifest payload exactly at 65536 bytes boundary is permitted
- [x] T2_B3_02: Manifest payload at 65537 bytes is rejected as oversized

### F4: Map ID URL Routing System (Requirement R3)
- [x] T1_F4_01: Parses /studio/:mapId extracting mapId parameter
- [x] T1_F4_02: Parses /play/:mapId extracting mapId parameter
- [x] T1_F4_03: resolveStudioPath generates canonical path with mapId or /studio root
- [x] T1_F4_04: resolvePlayPath generates canonical path with mapId
- [x] T1_F4_05: Root /studio path resolves without mapId, targeting Experience Hub
- [x] T2_B5_01: Rejects path traversal attempts in mapId segment
- [x] T2_B5_02: Trims trailing slashes cleanly on map route paths
- [x] T2_B5_03: Rejects URI-encoded injection tokens in mapId
- [x] T2_B6_01: Scene object state in map A is strictly isolated from map B
- [x] T2_B6_02: Mutating objects in map A does not pollute map B session
- [x] T2_B6_03: Navigating between map IDs triggers complete teardown and remount

### F5: Modernized Eye-Friendly Dark UX/UI Theme (Requirement R2)
- [x] T1_F5_01: Base canvas well background uses eye-friendly slate #1e1e24
- [x] T1_F5_02: Docked panels and tool drawers use medium dark #25252b
- [x] T1_F5_03: Top ribbon bar uses contrasting dark slate #282830
- [x] T1_F5_04: Borders use subdued low-glare solid #363640
- [x] T1_F5_05: Text styles use soft non-harsh #ededf2 and muted #a0a0ab
- [x] T2_B4_01: Canvas well #1e1e24 relative luminance is low-glare (< 0.05)
- [x] T2_B4_02: Panel #25252b relative luminance is subdued (< 0.06)
- [x] T2_B4_03: Soft text #ededf2 contrast against panel exceeds 10:1
- [x] T2_B4_04: Muted text #a0a0ab contrast against panel exceeds 4.5:1 (WCAG AA)
- [x] T2_B4_05: Preserves backward compatibility of legacy mochi dark tokens in CSS

### F6: Mock Social Data Removal (Requirement R4)
- [x] T1_F6_01: FriendsBar contract dictates real presence instead of dummy roster
- [x] T1_F6_02: Authenticated user displays real profile avatar in social status
- [x] T1_F6_03: Clean empty state renders when creator has zero connected friends
- [x] T1_F6_04: Online counter accurately reflects dynamic count of real active friends
- [x] T1_F6_05: Add friend trigger action remains present in clean social bar

### Cross-Feature Combinations (Tier 3)
- [x] T3_01: Template selection generates UUID, transitions route, and initializes scene
- [x] T3_02: Mock social removal with authenticated session renders real presence and clean empty state
- [x] T3_03: Eye-friendly dark theme token propagates across Studio Hub and 3D editor panels
- [x] T3_04: Draft modification in 3D editor triggers save and refreshes Studio Hub recent list
- [x] T3_05: Route switching between /studio/:mapId and /play/:mapId preserves exact map identity
- [x] T3_06: Unauthenticated visitor template pick triggers auth then initializes draft with mapId

### Real-World Application Scenarios (Tier 4)
- [x] T4_01: Obby Creator Journey: Hub -> Template -> /studio/:mapId -> Save -> /play/:mapId
- [x] T4_02: Returning Creator Workflow: Hub -> Load Draft -> Inspect -> Modify -> Save
- [x] T4_03: Low-Glare Dark Environment Journey: Hub and 3D editor maintain subdued contrast
- [x] T4_04: Unauthenticated Visitor Onboarding: Browse Hub -> Action -> Login -> Draft initialized
- [x] T4_05: Social Presence Transition: Guest -> Login -> Real presence and clean zero-friends state

---

## 4. Compliance Audits

1. Single Responsibility Principle (SRP):
   - TEST_INFRA.md: 106 lines (<= 300) [PASS]
   - TEST_READY.md: <= 200 lines (<= 300) [PASS]
   - mochi/tests/e2e_experience_hub.test.ts: 268 lines (<= 300) [PASS]
   - mochi/tests/e2e_map_routing.test.ts: 238 lines (<= 300) [PASS]
2. Zero Unicode Emojis:
   - Scanned all created and modified files: 0 emoji characters found [PASS]
3. Zero Legacy Platform Names:
   - Zero occurrences of legacy platform names or prefixes in source and test files [PASS]
4. 4-Locale i18n Parity:
   - Zero missing keys across en, th, ja, zh locales [PASS]
5. Test Execution:
   - 41 test files in mochi/ (488 tests passed, 0 failed) [PASS]
   - 25 test files in mochi-cloud/ (221 tests passed, 0 failed) [PASS]
   - Grand Total: 66 test files, 709 tests passed (100%) [PASS]

---

## 5. Tier 5 Adversarial Hardening Suite (M5 / M6)

Tier 5 attacks the subsystems added in M6 plus the invariants they depend on.
Unlike the Tier 1-4 contract suites, every Tier 5 case imports the real
production modules (no duplicated fixtures or local helper reimplementations).

| File | Scope | Tests | Status |
|---|---|---|---|
| mochi/tests/tier5_starter_environment.test.ts | Skybox catalog integrity, on-disk EXR/preview presence, manifest parity, environment coercion, NaN/Infinity/`__proto__` rejection, CDN URL joining | 15 | PASS |
| mochi/tests/tier5_server_manifest.test.ts | Remote event naming (reserved, length, injection chars), script count/byte ceilings, duplicate detection, rate-limit clamping, token bucket, bus direction/payload/rate limits, handler isolation, stats | 23 | PASS |
| mochi/tests/tier5_asset_library.test.ts | SDK query building, endpoint/verb mapping, id encoding, share-token header propagation, payload pass-through | 14 | PASS |
| mochi-cloud/tests/tier5_asset_access.test.ts | Permission ranking, grant expiry, owner/admin bypass, private/public/unlisted matrix, user/public/token grants, strongest-grant selection, grant input validation, server manifest authority checks | 31 | PASS |
| mochi/tests/tier5_studio_panels.test.tsx | Render contracts for environment picker, asset library, material library, upload drop zone, and server authoring panels; emoji-free markup; no callbacks during render | 15 | PASS |
| mochi/tests/tier5_material_library.test.ts | Material catalog integrity, on-disk map presence and size budget, manifest parity, id rejection, URL joining, mesh material fallbacks | 10 | PASS |
| mochi-cloud/tests/tier5_room_rate_limiter.test.ts | Per-channel token buckets, refill, channel/player isolation, block escalation and expiry, fallback limits, disconnect cleanup | 9 | PASS |
| mochi-cloud/tests/tier5_access_keys.test.ts | Access id shape and uniqueness, upload-before-use gate (unknown/pending/blocked/forbidden), grant and expiry handling, object asset-ref extraction, Worker-gated access domain resolution | 21 | PASS |
| mochi/tests/tier5_access_assets.test.ts | Access asset host resolution, same-origin dev fallback, trailing-slash normalisation, absolute URL preservation | 7 | PASS |
| mochi-cloud/tests/tier5_server_scripting.test.ts | Lua semantics (precedence, strings, branches, loops, for-in, recursion, tables, stdlib), sandbox boundaries, step/depth limits, syntax errors | 19 | PASS |
| mochi-cloud/tests/tier5_server_events.test.ts | Handler lifecycle, OnServerEvent validation, reload clearing, allowlist persistence and trimming, JS handler precedence, room script payload envelope | 13 | PASS |
| mochi/tests/tier5_physics_kernel.test.ts | Shipped wasm export surface and size, kernel init, ray entry distance and face normals, kernel-vs-TS parity sweep, sphere-AABB inside/outside cases, engine wiring for raycast and sphere-box manifolds | 12 | PASS |

### Tier 5 Coverage Highlights

- Environment coercion is total: every hostile value (NaN, Infinity, strings,
  out-of-range numbers, invalid hex, unknown skybox ids, `__proto__` payloads)
  resolves to a bounded `EnvironmentState` with a closed key set.
- Every advertised skybox preset is verified against the filesystem, so the
  Studio picker cannot reference a missing HDRI.
- Remote event names reject reserved runtime identifiers and shell/path
  metacharacters; the bus enforces direction, 8KB payload ceiling, and
  per-event token-bucket rate limits before any transport call.
- Access policy never leaks a private file: anonymous, wrong-user, expired, and
  wrong-token viewers all resolve to `none`, and gated R2 reads are served with
  `Cache-Control: private, no-store`.

### Current Totals

- mochi/: 78 test files, 897 tests passed
- mochi-cloud/: 43 test files, 462 tests passed
- Grand Total: 121 test files, 1359 tests passed (100%)
- typecheck: both workspaces clean
- production build: `mochi` builds successfully (wasm kernel copied to dist/wasm)
- lint:lines: 449 files strictly <= 300 lines

---

## Appendix: current totals (2026-11-13)

The figures above are the snapshot this report was written against. After the
Phase 2-4 work (animation, navigation, agents, local avoidance, spatial audio,
replication) the live totals are:

- mochi/: 122 test files, 1454 tests passed
- mochi-cloud/: 53 test files, 565 tests passed
- Grand Total: 175 test files, 2019 tests passed
- typecheck: both workspaces clean
- lint:lines: 688 files strictly <= 300 lines
- notices: 17 components, current
- decoupling: 670 files, zero forbidden imports
- wasm kernel: 29,410 bytes, 8 exports verified by `npm run build:wasm`

Measured with `npx vitest run --no-file-parallelism`. A plain `vitest run` on this
Windows machine occasionally fails to start a forks worker and silently drops a
whole test file (vitest prints `Errors 1` and still exits 0), so a count can read
lower by that file's size. Use the flag when the number has to be trusted.
