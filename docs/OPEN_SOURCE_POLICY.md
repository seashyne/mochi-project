# Open Source Policy

Mochi ships as a commercial, closed-source product. This document records which
upstream code we may reuse, under what conditions, and where the attribution
obligations live.

## Verdict on the engine snapshots in `engine open source/`

| Source | License | Sell in a closed product | Decision |
| --- | --- | --- | --- |
| PlayCanvas Engine 2.25 (`engine-main.zip`) | MIT, single copyright holder, no bundled third-party code | Yes | **Adopt as reference + selective vendor** |
| Godot 4 (`godot-master.zip`) | MIT engine, CC BY 4.0 editor art, 2,397-line third-party notice file | Yes, with care | **Read-only architecture reference** |
| LÖVE (`love-main.zip`) | zlib runtime, but bundles **OpenAL Soft (LGPL)** and FreeType (FTL) | Risky | **Do not ship** |

### Why PlayCanvas

- One license, one copyright holder, zero sub-licensed components. A single MIT
  notice covers everything we take.
- JavaScript/WebGL/WebGPU, the same stack as `mochi/src/engine`. Modules can be
  vendored file-by-file without a build-system port.
- No trademark obligation beyond not branding our product as PlayCanvas.

### Why Godot is read-only

The engine source is MIT and legally fine. The friction is practical:

- `thirdparty/` carries 2,397 lines of notices that must be reproduced verbatim
  if we ship the binary.
- Editor icons and art are **CC BY 4.0**, a different license from the code.
- A WASM build lands in the tens of megabytes, which is the wrong shape for a
  browser player that already runs on Three.js.

Read it for architecture (scene tree, resource ownership, node lifecycle). Do
not compile it into the product.

### Why LÖVE is blocked

`love-main/license.txt` lists OpenAL Soft, which is **LGPL**. Statically linking
LGPL into a proprietary binary requires giving recipients a way to relink
against a modified version, which means shipping object files or a relinkable
build. That is a real obligation, not a formality, and it buys us nothing we do
not already have: Mochi's Lua interpreter shipped in M9.

## Confidentiality: what stays secret

The product must ship as a closed, confidential codebase. That requirement rules
out any copyleft dependency and shapes the rest of this policy.

- **MIT does not require source disclosure.** It grants rights; it takes nothing
  away. Our derivative work, our engine internals, our server code and our
  algorithms all stay proprietary and confidential.
- **The only obligation is a notice file.** MIT requires the copyright line and
  permission text to accompany distributed copies. That is a credits document,
  not a disclosure of our source, and it reveals nothing about how we build.
- **LGPL is the actual confidentiality risk.** LÖVE's OpenAL Soft would require
  giving recipients a way to relink a modified library, which means handing over
  build artifacts. That is why LÖVE is blocked, not because of the zlib runtime.
- **No attribution-free option exists.** 0BSD is the only common license that
  asks for nothing, and none of the three engines use it. Attribution text is
  unavoidable, and it is the cheapest possible price for reusing the code.
- **Upstream is already public.** PlayCanvas and Godot source are published
  openly. Nothing we take from them was ever secret; only our own code is, and
  it stays that way.

Practical consequence: keep `THIRD_PARTY_NOTICES.txt` accurate, never vendor
copyleft code, and never accept a dependency whose license requires us to
publish modifications.

## Vendoring rules

1. Copy into `mochi/src/engine/vendor/<project>/` only the files actually used.
   Never import from a checkout, an archive, or a git URL.
2. Preserve every upstream copyright header verbatim. Do not reformat vendored
   files.
3. Record each vendored file in `mochi/public/THIRD_PARTY_NOTICES.txt` by adding
   an entry to `VENDORED` in `scripts/gen-notices.mjs`.
4. One pull request per subsystem, with a parity test against the existing
   implementation before the old path is removed. Same standard as the M10
   physics kernel.
5. Vendored code is exempt from the 300-line file cap, but must be listed in
   `IGNORED_DIRS` in `scripts/check-line-counts.mjs`.

## Attribution obligations we already carry

`mochi/public/THIRD_PARTY_NOTICES.txt` is generated from the production
dependency graph by `npm run notices` and copied into `dist/` and `dist-studio/`
by Vite. It currently covers 16 components, including MIT (Three.js, React,
Capacitor, wasmoon, hono), ISC (lucide-react) and 0BSD (tslib).

Regenerate it whenever a production dependency changes, and before every deploy.

## Trademark boundaries

- We may say our engine "uses PlayCanvas-derived code" in a notice file.
- We may not use Godot, PlayCanvas or LÖVE names, logos or trade dress in the
  product name, marketing copy, domain, or app store listing.
- The Mochi name and marks remain ours alone.

## Open questions

- Contributor licensing: external contributions currently have no CLA. Decide
  before accepting outside pull requests, or the copyright in our own code
  becomes mixed.
