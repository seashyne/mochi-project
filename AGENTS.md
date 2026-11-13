# AGENTS.md — Binding Standard for Every Agent on This Project

This file is the single source of truth for how work is done in this repository.
It applies to every agent and every human contributor, regardless of role,
model, or session. If a task instruction conflicts with this file, stop and ask
the user — do not silently pick one.

Read these before editing anything:

| File | Why |
| --- | --- |
| `PROJECT.md` | Architecture, feature inventory, milestones, interface contracts |
| `docs/OPEN_SOURCE_POLICY.md` | Which upstream code we may reuse, and the confidentiality rules |
| `docs/PLAYCANVAS_ADOPTION.md` | The only approved plan for bringing engine code in |

## 1. Hard invariants

These are enforced by tooling. Do not negotiate with them, and do not weaken a
check to make your change pass.

| Invariant | Limit | Enforced by |
| --- | --- | --- |
| File size (SRP) | every file <= 300 lines | `npm run lint:lines` |
| i18n parity | identical keys across `en`, `th`, `ja`, `zh` | `vitest tests/i18n.test.ts tests/challenger_i18n_m2.test.ts` |
| No Unicode emoji | zero, in any file | `vitest` (probe suite) |
| No legacy brand strings | zero | `vitest tests/rebrand.test.ts` |
| Studio colours | `studio-*` tokens only, never raw palette classes | `vitest` (theme suite) |
| App decoupling | Player must not import Studio, and vice versa | `npm run verify:decoupling` |
| Third-party notices | regenerated and current | `npm run verify:standards` |

Run `npm run verify:standards` before you hand off. It chains the three cheap
checks. It is not a substitute for the test suite.

## 2. When a file hits 300 lines

Do not delete comments to squeeze under the cap. Split by responsibility:

1. Extract a subcomponent into its own file in the same directory.
2. Extract pure helpers into a `*.helpers.ts` or `*.ops.ts` sibling.
3. Extract copy into the matching i18n domain file.

Every split must keep the public import path working, or update every importer
in the same change.

## 3. Where new copy goes

The main locale files (`i18n/locales/en.ts`, `th.ts`, `ja.ts`, `zh.ts`) are at
the 300-line ceiling. **Never add keys to them.** Add to the smallest existing
domain file instead:

- Portal pages, footer, social, settings -> `locales/<lang>Pages.ts`
- Studio collaboration -> `locales/<lang>StudioTeam.ts`
- Install flow -> `locales/<lang>Install.ts`
- Animation -> `locales/<lang>Animation.ts`

Then add the field to the matching type file (`pagesTypes.ts`,
`studioTeamTypes.ts`, ...). All four languages must land in the same change, or
the parity test fails.

## 4. Dependencies and licensing

- Closed-source, commercial product. Never add a copyleft dependency. LGPL and
  GPL are both disqualifying, even transitively.
- Permissive only: MIT, ISC, BSD, Apache-2.0, 0BSD, zlib, OFL-1.1.
- OFL-1.1 is allowed for fonts only. It permits embedding in a closed-source product
  but requires the copyright line and licence text to ship with the font, so a
  vendored font needs both `mochi/public/fonts/OFL-<family>.txt` and an entry in the
  `VENDORED` array of `scripts/gen-notices.mjs`. Fonts are fetched by
  `node scripts/fetch-fonts.mjs`; never link a font from a third-party CDN at
  runtime - the shell must not depend on an external host.
- After any `package.json` dependency change, run `npm run notices` and commit
  the regenerated `mochi/public/THIRD_PARTY_NOTICES.txt`.
- Upstream engine code goes only into `mochi/src/engine/vendor/<project>/`,
  verbatim, headers intact, and must be registered in the `VENDORED` array in
  `scripts/gen-notices.mjs`.
- `engine open source/` is a read-only reference shelf. It is gitignored. Never
  import from it, never copy a file from it without going through the vendor
  process above.
- **CPU-bound work belongs in `mochi-physics-wasm`**, not in a TypeScript loop:
  spatial queries and interest management, the nav bake, avoidance, LOD
  decimation, occlusion tests, mesh validation, movement reconciliation, and wire
  codecs. Every kernel function ships with a TypeScript reference and a parity
  test; `npm run build:wasm` verifies the export list so a stale artifact cannot
  ship. The full boundary, including what must stay in TypeScript, is
  `docs/PLATFORM_ROADMAP.md` section 8.

## 5. Working in parallel with other agents

Multiple agents edit this repo at the same time. Assume you are not alone.

- **Stay in your lane.** Only edit files inside the area your task owns. If you
  need a change outside it, report it instead of making it.
- **Never reformat or re-save a file you did not need to change.** A whitespace
  diff on someone else's file creates conflicts and hides real changes.
- **Never revert someone else's work** to make your build pass. If their change
  breaks a check, say so with the file and line, and let the user decide.
- **Do not fight over `dist/`.** If a build fails at `prepare-out-dir`, the
  output directory is locked by another run; wait, or build to a temp out dir.
  Do not delete `dist/` or `dist-studio/` to "fix" it.
- **Report, do not guess.** If a check fails in a file you never touched, state
  that plainly with evidence (path, line count, timestamp).

## 6. Definition of done

A change is not done until all of these are true:

- [ ] `npx tsc -b --noEmit` in `mochi/` (or `mochi-cloud/`) is clean
- [ ] `npm run lint:lines` passes for the files you touched
- [ ] `npm run verify:standards` passes
- [ ] `npx vitest run` passes, or the only failures are pre-existing and proven so
- [ ] New user-facing copy exists in all four languages
- [ ] No new dependency, or the dependency is permissive and notices regenerated
- [ ] CPU-bound work is in the kernel, or the handoff says why it is not
- [ ] The handoff states exactly which files changed and which checks were run

## 7. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:player` / `dev:studio` | Local dev servers |
| `npm run build:player` / `build:studio` | Production builds |
| `npm run typecheck` | TypeScript across workspaces |
| `npm test` | Vitest across workspaces |
| `npm run lint:lines` | 300-line ceiling |
| `npm run notices` | Regenerate third-party attribution |
| `npm run verify:standards` | lint + notices + decoupling |
| `npm run verify:decoupling` | Player/Studio import isolation |
| `npm run benchmark:room` | 30-peer room tick cost |
| `npm run benchmark:client` | Render counters in real Chrome (needs Chrome; reports draw calls, not fps) |
| `npm run benchmark:kernel` | Kernel versus TypeScript timings; see `docs/KERNEL_AUDIT.md` |

## 8. Product decisions already made

Do not reopen these without the user asking:

- Engine reuse: PlayCanvas (MIT) only. Godot is read-only reference. LÖVE is
  blocked because of its LGPL audio dependency.
- Attribution: `mochi/public/THIRD_PARTY_NOTICES.txt`, generated, linked from
  `/credits` and the footer.
- Theme: eye-friendly dark palette through `--studio-*` tokens.
- No mock data in shipped UI. Empty states are the answer, not placeholders.
