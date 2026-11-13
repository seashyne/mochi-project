// Replication bridge: publishing on a fixed interval, applying a peer's delta to
// the local nodes, and the authority rule that stops two peers fighting.

import { describe, expect, it } from 'vitest';
import { ReplicationChannel, type DeltaPayload } from '../src/engine/multiplayer/replication';
import {
  createReplicationBridge,
  type ReplicatedBody,
  type ReplicationBridge
} from '../src/engine/multiplayer/replicationBridge';

class Body implements ReplicatedBody {
  rotation = { x: 0, y: 0, z: 0 };
  position: { x: number; y: number; z: number };

  constructor(readonly id: string, x = 0, z = 0) {
    this.position = { x, y: 0, z };
  }

  getPosition() {
    return this.position;
  }

  setPosition(x: number, y: number, z: number) {
    this.position = { x, y, z };
  }

  setRotation(x: number, y: number, z: number) {
    this.rotation = { x, y, z };
  }
}

/** Two bridges wired to each other, the way two peers are wired by the room. */
function pair(options: { maxEntries?: number } = {}) {
  const sent: DeltaPayload[] = [];
  let peerB: ReplicationBridge | null = null;

  const aBody = new Body('npc', 0, 0);
  const bMirror = new Body('npc', 0, 0);

  const a = createReplicationBridge({
    channel: new ReplicationChannel(),
    owner: 'peer-a',
    bodies: () => [aBody],
    send: (payload) => {
      sent.push(payload);
      peerB?.receive(payload, 'peer-a');
    },
    maxEntries: options.maxEntries
  });

  const b = createReplicationBridge({
    channel: new ReplicationChannel(),
    owner: 'peer-b',
    bodies: () => [bMirror],
    // Remote objects are never published back.
    shouldReplicate: () => false,
    send: () => undefined
  });

  peerB = b;
  return { a, b, aBody, bMirror, sent };
}

describe('publish cadence', () => {
  it('publishes at 10 Hz and skips frames in between', () => {
    const { a, aBody, sent } = pair();
    a.update(0.05);
    expect(sent).toHaveLength(0);
    a.update(0.05);
    expect(sent).toHaveLength(1);

    aBody.setPosition(2, 0, 0);
    a.update(0.05);
    expect(sent).toHaveLength(1);
    a.update(0.05);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing while the owned bodies sit still', () => {
    const { a, sent } = pair();
    a.update(0.1);
    expect(sent).toHaveLength(1);
    a.update(0.1);
    a.update(0.1);
    expect(sent).toHaveLength(1);
  });

  it('chunks a large delta instead of sending one oversized message', () => {
    const bodies = Array.from({ length: 100 }, (_, index) => new Body(`npc_${index}`, index, 0));
    const sent: DeltaPayload[] = [];
    const bridge = createReplicationBridge({
      channel: new ReplicationChannel(),
      owner: 'peer-a',
      bodies: () => bodies,
      send: (payload) => sent.push(payload),
      maxEntries: 64
    });

    bridge.flush();
    expect(sent).toHaveLength(2);
    expect(sent[0].entries).toHaveLength(64);
    expect(sent[1].entries).toHaveLength(36);
  });
});

describe('receive', () => {
  it('moves the mirrored body to the sender transform', () => {
    const { a, aBody, bMirror } = pair();
    aBody.setPosition(3.5, 1, -2.25);
    aBody.setRotation(0, 1.1, 0);

    a.update(0.1);

    expect(bMirror.position.x).toBeCloseTo(3.5, 2);
    expect(bMirror.position.z).toBeCloseTo(-2.25, 2);
    expect(bMirror.rotation.y).toBeCloseTo(1.1, 2);
    // Pitch and roll belong to the local side, not the wire.
    expect(bMirror.rotation.x).toBe(0);
  });

  it('ignores a peer delta for an object it owns itself', () => {
    const owned = new Body('npc', 0, 0);
    const bridge = createReplicationBridge({
      channel: new ReplicationChannel(),
      owner: 'peer-b',
      bodies: () => [owned],
      send: () => undefined
    });

    bridge.flush();
    owned.setPosition(9, 0, 9);
    bridge.receive(
      { tick: 99, entries: [{ id: 'npc', x: 1, y: 0, z: 1, ry: 0 }], removed: [] },
      'peer-a'
    );

    expect(owned.position).toEqual({ x: 9, y: 0, z: 9 });
  });

  it('drops an entry for a body it cannot resolve', () => {
    const bridge = createReplicationBridge({
      channel: new ReplicationChannel(),
      owner: 'peer-b',
      bodies: () => [],
      send: () => undefined
    });

    expect(() =>
      bridge.receive(
        { tick: 1, entries: [{ id: 'ghost', x: 1, y: 0, z: 1, ry: 0 }], removed: [] },
        'peer-a'
      )
    ).not.toThrow();
  });
});

describe('shouldReplicate', () => {
  it('leaves out bodies the predicate rejects', () => {
    const agent = new Body('agent', 0, 0);
    const prop = new Body('prop', 5, 5);
    const sent: DeltaPayload[] = [];

    const bridge = createReplicationBridge({
      channel: new ReplicationChannel(),
      owner: 'peer-a',
      bodies: () => [agent, prop],
      shouldReplicate: (body) => body.id === 'agent',
      send: (payload) => sent.push(payload)
    });

    bridge.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].entries.map((entry) => entry.id)).toEqual(['agent']);
  });
});
