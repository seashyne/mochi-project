# Audio

`mochi/src/engine/runtime/audioBus.ts` synthesises every sound at runtime: no
audio assets ship with the editor, so `world.playSound("anything")` always
produces something and known names get hand-tuned recipes.

## Buses

Master feeds two buses, `sfx` and `music`. Each bus has its own level and mute, so
a creator can duck music without touching effects:

| Call | Effect |
| --- | --- |
| `setVolume(v)` | Master level, 0..1 |
| `setMuted(bool)` | Master mute, remembered across unlocks |
| `setBusVolume('sfx' \| 'music', v)` | Per-bus level |
| `setBusMuted('sfx' \| 'music', bool)` | Per-bus mute |

A recipe renders into the bus of the `play` call that triggered it
(`{ bus: 'music' }` defaults to `sfx`).

## Spatial behaviour

`engine/runtime/audioSpatial.ts` holds the maths as pure functions, so the bus
stays a thin WebAudio wrapper and the behaviour is testable without an
AudioContext.

- **Distance**: inverse-distance rolloff from a 2 m reference distance, silent at
  34 m, with a taper over the last tenth so a sound fades instead of clicking off.
- **Panning**: a stereo panner node per positioned sound, driven by the source
  direction projected onto the listener's right vector. Listener yaw 0 faces +Z;
  the playtest runtime feeds the follow camera's yaw, so panning matches the view.
- **Doppler**: `play(name, { position, velocity })` shifts tonal effects by the
  radial closing speed, clamped to one octave either way. Noise bursts are not
  pitch-shifted, because a filter sweep has no pitch to shift.

`world.playSound(name, position)` is the Lua surface. Scripts cannot pass a
velocity today, so Doppler only engages for engine-driven sounds.

## Limits

- Sources are mono and point-like: no cones, no occlusion, no reverb.
- Every effect is a one-shot recipe. There is no looping ambience and no
  positional music bed yet.
- Nothing streams from disk, so a creator cannot ship a recorded sound file.

## Uploaded samples

A creator's own audio plays through the same spatial pipeline as the synthesised
recipes: attenuation, panning, Doppler and bus routing are identical because both
paths go through one `prepare()` in the bus.

```lua
world.loadSound("acc_0123456789abcdef0123")   -- warm the cache
world.playSound("acc_0123456789abcdef0123", part.position)
```

`world.playSound` classifies its first argument:

| Form | Treated as |
| --- | --- |
| `acc_<20 hex>` | An access id, resolved through `/api/v1/access/assets/:id` |
| `http(s)://...`, `/path/file.mp3`, `data:audio/...` | A URL to fetch directly |
| Anything else | A built-in recipe name |

Access ids are the creator-facing handle and the one that should ship: they are
permissioned by the asset service, so a blocked or unauthorised file never yields a
URL. A bare URL bypasses that gate and is only appropriate for assets the creator
hosts elsewhere.

**The first call is silent.** Decoding is asynchronous and a one-shot cannot wait,
so `playSound` starts the fetch and returns. Call `world.loadSound` once during
setup - the sample cache then serves every later call.

The cache (`sampleLibrary.ts`) decodes each source once, shares the in-flight
promise between concurrent calls, keeps the 24 most recent buffers, and records a
failed decode so a broken file is not refetched every frame.
