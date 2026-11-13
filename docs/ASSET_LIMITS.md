# Asset Import Limits

An asset that breaks the budget is refused at import with a message naming the
limit and the actual value. Before this existed, a 500,000-triangle model loaded
and quietly ate a third of the frame budget.

## Limits

| Limit | Default | Rule |
| --- | --- | --- |
| Triangles per model | 50,000 | Summed over every primitive in the GLB |
| Meshes per model | 256 | `meshes.length` |
| Texture edge | 4,096 px | Longest edge of any embedded PNG or JPEG |
| File size | 32 MB | The GLB or audio file itself |
| Audio length | 300 s | WAV is exact; MP3 is estimated from the first frame |

Defaults live in `DEFAULT_ASSET_LIMITS` (`engine/assets/assetGuardrails.ts`).
Callers may pass a tighter budget; the Studio uses the defaults.

## What the message looks like

```
Model rejected: Model is 180000 triangles, over the 50000 triangles limit
```

`describeViolations` joins every breach into one line, so a model that is both too
detailed and too large says so once.

## Where it runs

- **Model import** (`engine/assets/modelLoader.ts`): the GLB is checked on the
  bytes already fetched, before three.js decodes a triangle. A rejected model never
  reaches the scene.
- **Audio import**: `validateAudio` is the same contract; it is wired where the
  upload path validates before storing.

Binary header scans (image dimensions, audio duration) run in the WASM kernel
(`image_dimensions`, `audio_duration_ms`). The TypeScript versions in
`engine/assets/assetInspectors.ts` are the fallback when the kernel is not loaded
and the reference the parity test compares against.

## What is not checked yet

- **`.gltf` (JSON) files.** Only the binary GLB container is parsed. A `.gltf` with
  external buffers passes the guardrail untouched.
- **KTX2 / compressed textures.** Their dimensions live in the container header,
  which the inspector does not read yet, so a 4K KTX2 slips through.
- **Audio formats other than WAV and MP3.** An unknown container returns no
  duration, and the length rule cannot fire. This is deliberate: refusing a file
  because its header is unfamiliar is worse than letting it through.
- **Triangle count is accessor arithmetic, not verification.** A file that lies
  about its accessor counts is not caught here; three.js will fail later.

Each of these is a known hole, listed so nobody assumes the guardrail is total.

## Access ids at publish

A manifest may reference an uploaded file by access id (`acc_` plus 20 hex digits),
either in an object property or inside Lua text. Publishing validates every id it
finds:

| Situation | Result |
| --- | --- |
| Id does not exist | Refused: `unknown asset access id` |
| Key is blocked | Refused: `not available to this publisher (blocked)` |
| Upload never finished | Refused: `not available to this publisher (pending)` |
| File row is gone | Refused: `the file behind this id no longer exists` |
| Another creator's private file, no grant | Refused: `not available to this publisher (forbidden)` |
| Own file, or public, or granted | Accepted |

Every problem is reported at once, not just the first, so a creator can fix the
manifest in one pass. The scan runs over the serialised manifest, which is how a
reference embedded in a script is caught as well as one in a property.

The point is where the failure lands: without this, a bad id surfaces as a missing
texture or a silent sound on a player's machine. With it, the publish call returns
`Invalid asset references` and names the id.

The validator lives in `services/assetRefs.ts` and is called from the publish route
with D1-backed lookups; its tests drive the same function with an in-memory lookup.
