# Delta State Replication

`mochi/src/engine/multiplayer/replication.ts` is the wire model for replicating
object transforms between peers. It is deliberately transport-free: the room
protocol decides how a `DeltaPayload` travels, this module decides what is worth
sending and who is allowed to send it.

## Authority

Every object has one owner. `setAuthority(id, owner)` records it, and a channel
only publishes objects it owns:

- `publish(tick, samples, owner)` skips any object whose authority belongs to
  another peer, so a peer cannot overwrite someone else's transform.
- `apply(payload, owner)` refuses entries for objects the local peer owns. Local
  authority wins, which is what stops two peers fighting over the same object
  frame after frame.
- An object with no recorded authority is writable by whoever claims it first;
  the claim sticks once published.

## What counts as a change

A delta carries only objects that moved since the last publish:

| Rule | Value |
| --- | --- |
| Position epsilon | 1 cm |
| Yaw epsilon | 0.02 rad (about 1.1 degrees) |
| Position quantisation | 1 cm |
| Yaw quantisation | 0.0017 rad (about 0.1 degrees) |

Quantisation happens *before* the change test, so a value below the wire
resolution is not "changed" and costs no bandwidth. Yaw is compared with
`angleDelta`, so turning from 359 to 1 degrees is a 2 degree change, not a full
lap.

An idle peer publishes `null`: no objects moved, no packet is sent.

## Payload

```ts
interface DeltaPayload {
  tick: number;
  entries: Array<{ id: string; x: number; y: number; z: number; ry: number }>;
  removed: string[];
}
```

`removed` lists objects that left the replicated set, so a peer can drop the
shadow copy instead of freezing it in place.

`chunkPayload(payload, maxEntries)` splits a payload so no message exceeds the
transport's size limit. Order is preserved and removals ride in the first chunk.

## Transport

`transform_delta` is a first-class room event. The path end to end:

1. `GameRuntime.update` ticks a `ReplicationBridge` at 10 Hz. It samples the nodes
   this peer replicates (agents, plus runtime spawns it created) and publishes.
2. `RuntimeNetworkAdapter.sendTransformDelta` hands the payload to
   `MultiplayerManager`, which sends `{ type: 'transform_delta' }` over the room
   socket.
3. `mochi-cloud` validates the shape (`do/transformDelta.ts`) and relays it to
   every session **except the sender**, under a 20/s token bucket.
4. On the receiving side `MultiplayerManager` emits the payload with the sender's
   id, the bridge applies it, and the nodes that resolve move. Entries for objects
   the receiver owns are refused, so an echo cannot win.

A peer publishes only `agent` objects and the dynamic nodes it spawned; static
geometry is never replicated, because it arrives with the world manifest.

## Limits

- First writer wins per object, **enforced by the room** (6.2). The Durable Object
  keeps an `OwnershipTable`: the first peer to send a delta for an id owns it, and
  later deltas from anyone else are dropped server-side before the relay. Removal
  is owner-only, and a disconnect frees that player's objects so they can be
  claimed again. The client channel keeps the same rule locally, but a modified
  client can no longer bypass it.
- Position and yaw only. Pitch and roll stay local.
- No interpolation or extrapolation on the receiving side yet: a remote agent
  snaps to each 10 Hz sample. `MultiplayerManager` interpolates player avatars,
  not replicated objects.
- No interest management for objects. Every peer receives every delta, unlike
  `player_state`, which is filtered by radius.
- Authority is per object id, not per object type: the room does not know that an
  id is an agent or a runtime spawn, so a claim cannot be constrained by policy.


## Server authority for player movement (6.1)

A `player_state` report is a claim, not a fact. The room runs it through
`validateMovement` (`do/roomMovement.ts`) and keeps the verdict:

| Rule | Default | On violation |
| --- | --- | --- |
| Horizontal speed | 18 m/s | Step shortened along the same direction |
| Distance in one report | 25 m | Previous position kept (`teleport`) |
| Vertical change in one report | 40 m | Previous position kept (`teleport`) |
| Non-finite coordinates | - | Previous position kept |
| World bounds (optional) | - | Clamped to the box |

The elapsed time comes from the sender's last accepted report, with a 50 ms floor
matching the 20 Hz broadcast. A lagging client therefore is not punished for a
legitimately long step.

When the room overrules a report, it broadcasts the corrected presence to the
other players **and** sends the same correction straight back to the sender with
`corrected: <reason>`. `MultiplayerManager` recognises its own id, emits the
position to a snap listener, and `createPlayerSession` moves the local body there
and zeroes its velocity. That round trip is what makes a client that edits its own
position rubber-band back.

**Not full authority yet.** The client still runs its own physics and the server
only validates reported outcomes. There is no client prediction, no replay of
inputs and no server-side collision simulation, so a cheater can still get small
advantages inside the allowed envelope. Object transforms (4.2) remain
first-writer-wins; 6.2 moves their ownership to the room.

## Room edge validation (6.3 / 6.4)

`world_op` is checked before it is relayed: valid kind, id and type, finite
position/scale/rotation, positive scale, positions inside the world box, and an 8 KB
payload ceiling. Spawns also pass a per-player token bucket (10/s, burst 20), so a
spawn loop cannot flood every other player.

`state_replicate` with a score-shaped key (`score`, `coins`, `points`,
`leaderboard`) is clamped: non-finite and negative values become 0, values above
the ceiling are capped, and growth faster than 10,000 per second is cut back to the
allowed slope. Keys that are not scores are relayed unchanged. The room does not
know a game's scoring rules - these are bounds on absurdity, not an anti-cheat
verdict on legitimate play.

Both the spawn budget and the score baseline are released on disconnect.
