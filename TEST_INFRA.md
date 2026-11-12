# TEST_INFRA: Mochi Studio Revamp & Experience Hub E2E Architecture

## 1. Test Philosophy

The Mochi Studio Revamp and Experience Hub test suite follows an opaque-box,
requirement-driven testing philosophy derived strictly from ORIGINAL_REQUEST.md.

### Core Principles
- Opaque-Box Execution: Tests validate system behaviors, observable side effects,
  interface contracts, and state transformations without depending on internal
  private component implementation details.
- Requirement-Driven Traceability: Every test case is explicitly mapped to user
  requirements (R1 Studio Hub, R2 Eye-Friendly Dark Theme, R3 Map ID Routing,
  R4 Mock Data Removal).
- Isolation and Determinism: Each test executes with isolated memory, clean mock
  storage, independent route state, and predictable network contract fixtures.
- Progressive Testability: Tests assert public interface contracts cleanly and
  gracefully validate current vs upcoming milestone capabilities.

## 2. Feature Inventory

The test suite covers six core features across four implementation milestones:

| ID | Feature Name | Requirement | Milestone | Primary Interface / Module |
|---|---|---|---|---|
| F1 | Studio Hub Landing View | R1 | M2 | StudioHub.tsx, App.tsx |
| F2 | Starter Templates (Baseplate, Flat Terrain, Obby) | R1 | M2 | studioTemplates.ts |
| F3 | User Drafts List & Persistence | R1 | M2 | studioDraftsApi, StudioHubRecentList.tsx |
| F4 | Map ID URL Routing (/studio/:mapId, /play/:mapId) | R3 | M3 | studioRouting.ts, App.tsx |
| F5 | Eye-Friendly Dark Design Tokens | R2 | M1, M4 | tailwind.config.js, index.css |
| F6 | Social Presence Mock Removal & Real Auth State | R4 | M1 | FriendsBar.tsx, useAuthStore.ts |

## 3. Four-Tier Test Architecture

The E2E test suite is organized into four hierarchical verification tiers:

### Tier 1: Feature Coverage (Happy Path)
Validates core requirements under nominal operating conditions (>=5 tests per feature):
- F1 Studio Hub: Landing view mounting on /studio, template selection cards, drafts
  grid rendering, project creation actions, non-mounting of 3D canvas on hub.
- F2 Starter Templates: Baseplate manifest (64x64 slate), Flat Terrain (80x80 grass),
  Obby obstacle course (spawn, hazard, finish), starter Lua scripts, manifest byte limits.
- F3 Drafts List: Listing creator drafts via studioDraftsApi.listMine, pagination totals,
  draft metadata presentation, autosave flags, version stamping.
- F4 Map ID Routing: Parsing /studio, /studio/:mapId, and /play/:mapId; path resolvers;
  extracting UUIDs; keying viewports by mapId.
- F5 Eye-Friendly Dark Theme: Soft slate tokens (#1e1e24 base, #25252b panels,
  #282830 ribbon, #363640 borders, #ededf2 text), tailwind colors.studio, --studio-* CSS variables.
- F6 Social Presence: Removal of FRIENDS_ROSTER (10 dummy accounts), rendering real
  authenticated user presence, live online counters, clean empty state when 0 friends.

### Tier 2: Boundary & Corner Cases
Validates resilience against extreme boundaries, missing resources, and edge inputs:
- Empty States: Studio Hub with zero user drafts, empty template descriptions, zero
  connected friends display.
- Authentication Boundaries: Unauthenticated access to /studio, missing auth tokens
  when saving drafts, guest prompt triggers, expired tokens.
- Malformed Routing: Non-UUID mapId, path traversal attempts, query string overrides,
  deeply nested subpaths, trailing slashes, empty route segments.
- Draft Size & Schema Boundaries: Manifest payloads exceeding 64KB, empty manifests,
  special character escaping, missing title validation, corrupt JSON fallback.
- State Bleed Prevention: Cross-map state isolation, complete WebGL and physics
  teardown when switching mapId, resetting scene hierarchy and dirty flags.
- Theme Fallbacks: Missing CSS token graceful fallback, contrast ratio compliance.

### Tier 3: Cross-Feature Combinations
Validates pairwise interactions across interconnected subsystems:
- Template Selection -> Map ID Generation -> Route Transition -> State Isolation.
- Mock Removal -> Authenticated User Session -> Real Friends Counter Sync.
- Dark Theme Token Propagation across Studio Hub, Ribbon, Hierarchy, and 3D Canvas.
- Draft Editor Modification -> Save Trigger -> Studio Hub Recent List Invalidation.
- Route Switching between /studio/:mapId and /play/:mapId preserving map identity.

### Tier 4: Real-World Application Scenarios
Simulates realistic end-to-end creator and player journeys:
- Scenario 1 (Obby Creator Journey): Creator opens /studio, selects Obby template,
  navigates to /studio/:mapId, modifies obstacle heights, saves draft, transitions
  to /play/:mapId to playtest without cross-map state bleed.
- Scenario 2 (Returning Creator Workflow): Creator visits /studio, loads existing
  saved project from drafts list, inspects hierarchy objects, applies changes, and saves.
- Scenario 3 (Theme Ergonomics Journey): Creator works in low-glare dark environment,
  verifying contrast and color hierarchy across all panels and toolbars.
- Scenario 4 (Unauthenticated Visitor Onboarding): Visitor browses templates on /studio,
  initiates project creation, completes authentication, and resumes with new draft.
- Scenario 5 (Social Presence Transition): User logs in, FriendsBar updates from guest
  to real presence, showing empty state when no friends are online.

## 4. Test Suite Implementation Files

| File Path | Target Scope | Max Lines | Compliance Status |
|---|---|---|---|
| mochi/tests/e2e_experience_hub.test.ts | Tier 1 & Tier 2: Hub, Templates, Drafts, Dark Tokens, Social | <= 300 | Validated |
| mochi/tests/e2e_map_routing.test.ts | Tier 1 & Tier 2 Routing, Tier 3 Combinations, Tier 4 Scenarios | <= 300 | Validated |

## 5. Quality Thresholds and Compliance Rules

All test files must strictly satisfy the project compliance invariants:
1. Single Responsibility Principle: Every file strictly <= 300 lines of code.
2. Zero Unicode Emojis: All test files and documentation contain zero emojis.
3. Zero Legacy Platform Strings: Zero occurrences of legacy platform names or prefixes.
4. 4-Locale i18n Parity: Parity across en, th, ja, and zh for any introduced text keys.
5. Deterministic Execution: Zero flaky timing dependencies or external network calls.
