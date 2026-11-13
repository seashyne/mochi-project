# Mochi Web 3D Game Player Runtime Specification

This document details the architecture, execution loop, asset streaming pipeline, input subsystem, and sandboxing bridge of the Mochi web runtime.

---

## 1. Runtime Architecture Overview

The Mochi web runtime is a lightweight client container optimized for browser-based 3D game execution. It decouples the deterministic simulation of game logic from display rendering, ensuring fluid animation on high-refresh-rate displays without physics drift.

```
+-------------------------------------------------------------------------+
|                         MOCHI RUNTIME CONTAINER                         |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | INPUT SUBSYSTEM                                                   |  |
|  | Normalized Pointer | Virtual Joystick | Gamepad API | Keyboard     |  |
|  +---------------------------------+---------------------------------+  |
|                                    | Input Sample Snapshot              |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | DUAL-TIMESTEP EXECUTION LOOP                                      |  |
|  |  +-----------------------------+   +----------------------------+ |  |
|  |  | Fixed 60Hz Physics Ticker   |   | Variable 120Hz Render Loop | |  |
|  |  | (Deterministic Simulation)  |   | (State Interpolation alpha)| |  |
|  |  +-----------------------------+   +----------------------------+ |  |
|  +---------------------------------+---------------------------------+  |
|                                    | Render Commands                    |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | GRAPHICS PIPELINE (WebGL2 / WebGPU Path)                          |  |
|  | Scene Graph | Shader Cache | Mesh Buffer Pool | Viewport Blitter  |  |
|  +---------------------------------+---------------------------------+  |
|                                    | Dynamic Asset Requests             |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | STREAMING & ASSET PIPELINE                                        |  |
|  | glTF/glb Loader | KTX2 Textures | WebAudio | IndexedDB LRU Cache |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. Dual-Timestep Execution Loop

To guarantee physics determinism across devices while taking full advantage of 90Hz, 120Hz, and 144Hz displays, Mochi uses an accumulator-driven loop.

### 2.1 Timestep Formulas
- Fixed Simulation Step: `FIXED_TIMESTEP = 1 / 60` (16.666 ms).
- Accumulator Update: `accumulator += min(frameDelta, MAX_FRAME_DELTA)` where `MAX_FRAME_DELTA = 0.1` (prevents spiral of death).
- Interpolation Factor: `alpha = accumulator / FIXED_TIMESTEP`.

### 2.2 Execution Algorithm
```typescript
interface TransformState {
  x: number;
  y: number;
  z: number;
}

class RuntimeLoop {
  private readonly FIXED_DT = 1 / 60;
  private readonly MAX_DT = 0.1;
  private accumulator = 0;
  private lastTime = 0;

  public tick(currentTime: number): void {
    if (this.lastTime === 0) {
      this.lastTime = currentTime;
    }
    const frameDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Prevent physics spiral when tab stalls
    this.accumulator += Math.min(frameDelta, this.MAX_DT);

    // Consume fixed physics steps
    while (this.accumulator >= this.FIXED_DT) {
      this.stepPhysics(this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
    }

    // Calculate interpolation alpha for visual rendering
    const alpha = this.accumulator / this.FIXED_DT;
    this.renderDisplay(alpha);
  }

  private stepPhysics(dt: number): void {
    // Updates previousState and currentState for all rigidbodies
  }

  private renderDisplay(alpha: number): void {
    // Interpolates visual transforms:
    // renderPos = prevPos * (1 - alpha) + currentPos * alpha
  }
}
```

### 2.3 Power Management and Throttling
- Tab Visibility: When `document.visibilityState === 'hidden'`, the loop halts physics progression, silences WebAudio, and enters sleep mode to prevent battery drain.
- Frame Budget Guard: If rendering exceeds 8.3ms in 120Hz mode, the runtime automatically downscales resolution or lowers shadow cascade resolution to preserve frame rate.
- Large-World Rendering: Three.js frustum culling handles off-screen meshes; imported models additionally use distance culling (300 units by default) so far-away subtrees skip draw submission entirely.
- Instanced Batching: repeated blocks, platforms, coins, spawns, jump pads (base plus flat ring), and hazards in each chunk are collapsed into `InstancedMesh` draw calls with per-instance matrices and colors. Hazards are grouped by color so each batch keeps the right emissive glow. Physics bodies and gameplay semantics stay per object.
- Model LOD: imported models render the full GLB up close and switch to a bounds-fit box proxy beyond 120 units (hiding entirely at the 300-unit cull distance). Studio previews always show the full mesh.
- Render Diagnostics: `RuntimeEngine.renderDiagnostics` captures draw calls, triangles, lines, points, textures, and geometries after each frame and can flag scenes above a configurable budget (default 1500 draw calls / 1.5M triangles).

### 2.4 Multiplayer Snapshots
- Transport: room WebSockets carry JSON events. Clients that connect with `binary=1` receive 20Hz player-state snapshots as `ArrayBuffer` frames (magic `M`, version 1, frame type 1, tick, UTF-8 player id, float32 x/y/z/rotation), while joins, leaves, RPC, and replicated state stay JSON.
- Interest Management: a player-state snapshot is only broadcast to observers within 60 world units, keeping bandwidth bounded on large maps.

### 2.5 Progressive Web App and Offline Playback
- Manifest: `manifest.webmanifest` declares standalone display, dark `#090b10` chrome, and a maskable brand icon, so Mochi installs as an app from the browser.
- Service Worker: `public/sw.js` precaches the app shell on install, serves hashed build assets and game bundles (`/assets/`, `/models/`, `/draco/`, `/basis/`, `/wasm/`) cache-first, and falls back to the cached shell for navigations when offline. `/api/` traffic is never cached.
- Registration: the worker registers only in production builds and only when `navigator.serviceWorker` exists. Registration failures are swallowed so the online app always stays usable.

---

## 3. Asset Streaming and Memory Management

### 3.1 Progressive Asset Ingestion
- Geometry: Progressive glTF/glb binary meshes parsed into non-indexed `Float32Array` vertex buffers.
- Textures: Basis Universal (KTX2) compressed textures transcoded on background Web Workers into native GPU formats (BC7, ASTC, or ETC2 depending on target hardware).
- Audio: WebAudio audio buffers streamed as Vorbis or AAC chunks and pre-decoded into reusable memory pools.

### 3.2 Two-Tier Caching System
1. Memory Cache (L1): Recently fetched asset blobs keyed by URL, available for the current session.
2. Persistent Storage (L2): Origin Private File System directory `mochi-assets`, also keyed by URL with a hashed filename. Writes are quota-safe and fall back to memory-only when OPFS is unavailable (private browsing, unsupported browsers).

Asset requests are cache-first: L1, then OPFS, then the network. Successful network responses are written to both tiers. The asset file route supports `Range: bytes=` requests, so cached or remote objects can be sliced without downloading the whole file.

```
Request Asset (URL)
       |
       v
Is in Memory (L1)?  -- Yes --> Return Instant Blob
       | No
       v
Is in OPFS (L2)?    -- Yes --> Promote to L1 & Return Blob
       | No
       v
Fetch from R2 CDN Edge -> Store in L2 -> Promote to L1 -> Return Blob
```

---

## 4. Unified Input Normalization

The runtime abstracts all interaction hardware into a normalized input snapshot:

```typescript
export interface MochiInputSnapshot {
  // Analog axes normalized from -1.0 to 1.0
  axes: {
    moveX: number;
    moveY: number;
    lookX: number;
    lookY: number;
  };
  // Digital action buttons
  actions: {
    primary: boolean;   // Jump / Action / Select
    secondary: boolean; // Attack / Cancel
    special: boolean;   // Inventory / Special
    pause: boolean;     // Pause / Menu
  };
  // Normalized pointer coordinates in screen space [0, 1]
  pointer: {
    x: number;
    y: number;
    isDown: boolean;
    button: number;
  };
}
```

### Supported Input Modalities
- Keyboard & Mouse: Mapped via `KeyboardEvent.code` (layout-independent e.g., `KeyW`, `KeyA`, `KeyS`, `KeyD`) and Pointer Lock API for first-person/free-camera games.
- Touch & Stylus: Virtual on-screen analog sticks and floating action buttons rendered automatically on tablet devices.
- Gamepad: HTML5 Gamepad API polling supporting standard layout controllers (Xbox, DualShock/DualSense, Switch Pro).

---

## 5. Sandboxed Execution and RPC Bridge

Untrusted creator game scripts run within a sandboxed execution boundary (Web Worker or null-origin iframe). Communication occurs exclusively over a typed JSON-RPC protocol.

### 5.1 Host-to-Sandbox Bridge
```typescript
export type HostToSandboxMessage =
  | { type: "INIT"; manifest: object; config: object }
  | { type: "TICK"; dt: number; input: MochiInputSnapshot }
  | { type: "PAUSE" }
  | { type: "RESUME" };

export type SandboxToHostMessage =
  | { type: "READY" }
  | { type: "RENDER_COMMANDS"; commands: Array<RenderOp> }
  | { type: "AUDIO_PLAY"; soundId: string; volume: number }
  | { type: "STORAGE_SAVE"; key: string; value: string }
  | { type: "ROOM_BROADCAST"; payload: object };
```

### 5.2 Security Invariants
- Denied Globals: The sandbox environment does not expose `window.location`, `window.parent`, `document.cookie`, `localStorage`, or raw `WebSocket`.
- Capability Gate: Persistent storage and networking must be explicitly declared in `mochi-game.json` permissions; requests exceeding permissions are dropped.
- Execution Guard: Script ticks exceeding 12ms are aborted to prevent infinite loops from hanging the browser UI thread.

## 6. Animation State Graph from Lua

A world whose manifest carries an `animationStateMachine` block plays clips
through transitions instead of starting every clip at once. Scripts drive it
through the `animation` global.

### 6.1 API

| Call | Effect |
| --- | --- |
| `animation.setParameter(name, value)` | Sets a parameter; numbers go to `number` parameters, everything else is coerced to boolean |
| `animation.setBool(name, value)` | Explicit boolean write |
| `animation.setNumber(name, value)` | Numeric write; non-finite values are dropped |
| `animation.trigger(name)` | Fires a one-shot trigger, consumed by the first transition that reads it |
| `animation.getState()` | Current state id, or `""` when the world has no graph |

### 6.2 Example

```lua
-- Mirror gameplay state into the graph; the graph decides which clip plays.
script.onUpdate.Connect(function(dt)
    local speed = player.getScore("Speed")
    animation.setNumber("speed", speed)
    animation.setBool("walking", speed > 0.5)
end)

-- Touch handlers, pads and one-off events fire a one-shot transition.
animation.trigger("jump")
```

### 6.3 Contract

- Every call is a no-op when the manifest has no state graph, so a script that
  drives animation still runs on worlds that do not use it.
- `getState()` returns an empty string rather than nil: the Lua host cannot
  return JS `null` (wasmoon probes `.then`) and `undefined` yields zero Lua
  values, which breaks `tostring`. Compare with `~= ""`.
- Parameters, transitions and exit times are validated when the manifest loads.
  An invalid graph is logged and the world falls back to playing its clips
  directly, rather than failing to load.
- The same rules run server-side (`mochi-cloud/src/services/animationValidation.ts`)
  when a draft or publish request is inspected, so a graph that can never run is
  rejected at the edge instead of being stored. That validator also cross-checks
  every `state.clipId` against the manifest's `animations` list.

## 7. Scripted Movement (`player.moveTo`)

`player.moveTo(x, z, speed?)` walks the local player to a world position through
the navigation grid baked from the scene. The path is A* over colliding
footprints, inflated by an agent radius, then smoothed to waypoints.

| Call | Effect |
| --- | --- |
| `player.moveTo(x, z, speed?)` | Starts a scripted walk. `speed` is metres per second (default 4). Returns `false` when no route exists |
| `player.stopMoving()` | Cancels the walk and leaves the player where it stands |
| `player.isMoving()` | `true` while a walk is in progress |

### 7.1 Example

```lua
if player.moveTo(12, -8, 5) then
    script.onUpdate.Connect(function(dt)
        if player.health <= 30 then
            player.stopMoving()
        end
    end)
end
```

### 7.2 Contract

- The grid is rebuilt lazily from the resident object list, so a chunked world
  re-bakes as it streams in. Pickups, spawns and `canCollide: false` objects do
  not block; nothing else about the physics step changes.
- Movement is kinematic: it writes the player position each frame and does not
  fight the character controller. Gravity and collision response continue
  outside the walk.
- Without a bridge (worlds that never sync objects) every call is a no-op and
  `isMoving()` returns `false`, so a script that navigates still runs anywhere.
- The bake itself runs in the Rust kernel when it is loaded: walkability plus
  connected-region labels, with the TypeScript rasteriser as the fallback. The
  labels let the pathfinder reject an unreachable goal without searching.


## 8. Agent NPCs (`agent.*`)

See [`RUNTIME_AGENTS.md`](./RUNTIME_AGENTS.md).

## 9. HUD and Dialogue (`ui.*`)

See [`RUNTIME_UI.md`](./RUNTIME_UI.md).
