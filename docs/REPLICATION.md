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

- First writer wins per object. There is no server arbiter: whoever publishes an
  object first claims it, and a later claim from another peer is ignored rather
  than resolved.
- Position and yaw only. Pitch and roll stay local.
- No interpolation or extrapolation on the receiving side yet: a remote agent
  snaps to each 10 Hz sample. `MultiplayerManager` interpolates player avatars,
  not replicated objects.
- No interest management for objects. Every peer receives every delta, unlike
  `player_state`, which is filtered by radius.

