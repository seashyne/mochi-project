// Delta replication: only what moved, only from the peer that owns it.

import { describe, expect, it } from 'vitest';
import {
  ReplicationChannel,
  angleDelta,
  chunkPayload,
  type TransformSample
} from '../src/engine/multiplayer/replication';

const sample = (id: string, x: number, z: number, ry = 0, owner?: string): TransformSample => ({
  id,
  x,
  y: 1,
  z,
  ry,
  owner
});

describe('publish', () => {
  it('sends every owned object the first time, then only what moved', () => {
    const channel = new ReplicationChannel();
    const first = channel.publish(1, [sample('a', 0, 0), sample('b', 5, 0)], 'me');
    expect(first?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const idle = channel.publish(2, [sample('a', 0, 0), sample('b', 5, 0)], 'me');
    expect(idle).toBeNull();

    const moved = channel.publish(3, [sample('a', 0, 0), sample('b', 6, 0)], 'me');
    expect(moved?.entries.map((entry) => entry.id)).toEqual(['b']);
    expect(moved?.entries[0].x).toBe(6);
  });

  it('ignores sub-resolution jitter and quantises to the wire grid', () => {
    const channel = new ReplicationChannel({ positionEpsilon: 0.05, positionStep: 0.01 });
    channel.publish(1, [sample('a', 0, 0)], 'me');

    expect(channel.publish(2, [sample('a', 0.004, 0)], 'me')).toBeNull();

    const nudged = channel.publish(3, [sample('a', 0.0649, 0)], 'me');
    expect(nudged?.entries[0].x).toBeCloseTo(0.06, 6);
  });

  it('treats a yaw wrap as a small change, not a full turn', () => {
    const channel = new ReplicationChannel({ rotationEpsilon: 0.05 });
    channel.publish(1, [sample('a', 0, 0, Math.PI * 2 - 0.01)], 'me');
    expect(channel.publish(2, [sample('a', 0, 0, 0.01)], 'me')).toBeNull();

    // A real half turn is still a change, so the wrap handling is not a mute switch.
    const turned = channel.publish(3, [sample('a', 0, 0, Math.PI)], 'me');
    expect(turned?.entries).toHaveLength(1);
  });

  it('never publishes an object another peer owns', () => {
    const channel = new ReplicationChannel();
    channel.setAuthority('theirs', 'peer-2');

    const payload = channel.publish(1, [sample('mine', 0, 0), sample('theirs', 1, 1)], 'me');
    expect(payload?.entries.map((entry) => entry.id)).toEqual(['mine']);
  });

  it('reports objects that left the replicated set', () => {
    const channel = new ReplicationChannel();
    channel.publish(1, [sample('a', 0, 0), sample('b', 1, 1)], 'me');

    const payload = channel.publish(2, [sample('a', 0, 0)], 'me');
    expect(payload?.removed).toEqual(['b']);
    expect(channel.peek('b')).toBeNull();
  });

  it('sends nothing for an empty replicated set', () => {
    const channel = new ReplicationChannel();
    expect(channel.publish(1, [], 'me')).toBeNull();
  });
});

describe('apply', () => {
  it('applies a peer delta and refuses objects it owns itself', () => {
    const local = new ReplicationChannel();
    local.setAuthority('mine', 'me');
    local.publish(1, [sample('mine', 0, 0)], 'me');

    const result = local.apply(
      {
        tick: 2,
        entries: [
          { id: 'theirs', x: 3, y: 1, z: 3, ry: 0 },
          { id: 'mine', x: 9, y: 1, z: 9, ry: 0 }
        ],
        removed: []
      },
      'peer-2'
    );

    expect(result.applied).toEqual(['theirs']);
    expect(result.ignored).toEqual(['mine']);
    expect(local.peek('mine')?.x).toBe(0);
    expect(local.peek('theirs')?.x).toBe(3);
  });

  it('does not echo a received transform back on the next publish', () => {
    const channel = new ReplicationChannel();
    channel.apply({ tick: 1, entries: [{ id: 'theirs', x: 3, y: 1, z: 3, ry: 0 }], removed: [] }, 'peer-2');

    // The object is not owned by us, so publishing must ignore it entirely.
    expect(channel.publish(2, [sample('theirs', 3, 3)], 'me')).toBeNull();
  });

  it('honours removals from a peer', () => {
    const channel = new ReplicationChannel();
    channel.apply({ tick: 1, entries: [{ id: 'theirs', x: 0, y: 0, z: 0, ry: 0 }], removed: [] }, 'peer-2');
    expect(channel.size).toBe(1);

    channel.apply({ tick: 2, entries: [], removed: ['theirs'] }, 'peer-2');
    expect(channel.size).toBe(0);
  });

  it('round-trips a transform through encode and decode', () => {
    const sender = new ReplicationChannel();
    const receiver = new ReplicationChannel();
    sender.setAuthority('npc', 'sender');

    const payload = sender.publish(1, [sample('npc', 4.25, -1.5, 1.2)], 'sender');
    receiver.apply(payload!, 'sender');

    const received = receiver.peek('npc');
    expect(received?.x).toBeCloseTo(4.25, 3);
    expect(received?.z).toBeCloseTo(-1.5, 3);
    expect(received?.ry).toBeCloseTo(1.2, 3);
  });
});

describe('chunkPayload', () => {
  it('splits on entry count and keeps removals in the first chunk', () => {
    const payload = {
      tick: 7,
      entries: [
        { id: 'a', x: 0, y: 0, z: 0, ry: 0 },
        { id: 'b', x: 1, y: 0, z: 1, ry: 0 },
        { id: 'c', x: 2, y: 0, z: 2, ry: 0 }
      ],
      removed: ['gone']
    };
    const chunks = chunkPayload(payload, 2);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].entries.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(chunks[0].removed).toEqual(['gone']);
    expect(chunks[1].entries.map((entry) => entry.id)).toEqual(['c']);
    expect(chunks[1].removed).toEqual([]);
  });

  it('returns nothing for an empty payload and one chunk for removals only', () => {
    expect(chunkPayload({ tick: 1, entries: [], removed: [] }, 4)).toEqual([]);
    expect(chunkPayload({ tick: 1, entries: [], removed: ['x'] }, 4)).toHaveLength(1);
  });
});

describe('angleDelta', () => {
  it('wraps across the seam', () => {
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(0.083, 3);
    expect(angleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 6);
  });
});
