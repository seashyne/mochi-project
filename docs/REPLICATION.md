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

## Not wired yet

The channel is complete and tested, but nothing sends a `DeltaPayload` over a
socket today:

1. The room protocol has no `transform_delta` event (`mochi/src/api/types.ts`,
   `mochi-cloud/src/do/roomMessages.ts`).
2. `RuntimeNetworkAdapter` exposes world ops and script RPCs, not transforms.

Until those land, the only replicated motion is `player_state`, which
`MultiplayerManager` throttles to 20 Hz. Roadmap item 4.3 covers the transport.
