// Wires a ReplicationChannel to a live world: publishes what this peer owns on a
// fixed interval, and applies a peer's delta to the nodes that resolve.

import {
  chunkPayload,
  ReplicationChannel,
  type DeltaPayload,
  type TransformSample
} from './replication';

export interface ReplicatedBody {
  readonly id: string;
  getPosition(): { x: number; y: number; z: number };
  readonly rotation: { x: number; y: number; z: number };
  setPosition(x: number, y: number, z: number): void;
  setRotation(x: number, y: number, z: number): void;
}

export interface ReplicationBridgeOptions<T extends ReplicatedBody> {
  channel: ReplicationChannel;
  /** This peer's id; also the authority owner it publishes as. */
  owner: string;
  bodies: () => T[];
  /** Which bodies this peer replicates. Defaults to all of them. */
  shouldReplicate?: (body: T) => boolean;
  send: (payload: DeltaPayload) => void;
  /** Seconds between publishes. Defaults to 0.1 (10 Hz). */
  intervalSeconds?: number;
  /** Entries per message; larger deltas are chunked. Defaults to 64. */
  maxEntries?: number;
}

export interface ReplicationBridge {
  update: (dt: number) => void;
  receive: (payload: DeltaPayload, senderId: string) => void;
  /** Publishes now, regardless of the interval. */
  flush: () => void;
  readonly channel: ReplicationChannel;
}

export function createReplicationBridge<T extends ReplicatedBody>(
  options: ReplicationBridgeOptions<T>
): ReplicationBridge {
  const interval = Math.max(options.intervalSeconds ?? 0.1, 0.016);
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 64));
  const shouldReplicate = options.shouldReplicate ?? (() => true);

  let accumulator = 0;
  let tick = 0;

  const flush = (): void => {
    const samples: TransformSample[] = [];
    for (const body of options.bodies()) {
      if (!shouldReplicate(body)) continue;
      const position = body.getPosition();
      samples.push({
        id: body.id,
        x: position.x,
        y: position.y,
        z: position.z,
        ry: body.rotation.y
      });
    }

    tick += 1;
    const payload = options.channel.publish(tick, samples, options.owner);
    if (!payload) return;
    for (const chunk of chunkPayload(payload, maxEntries)) options.send(chunk);
  };

  const receive = (payload: DeltaPayload, senderId: string): void => {
    const { applied } = options.channel.apply(payload, senderId);
    if (applied.length === 0) return;

    const byId = new Map<string, T>();
    for (const body of options.bodies()) byId.set(body.id, body);

    for (const id of applied) {
      const body = byId.get(id);
      const entry = options.channel.peek(id);
      if (!body || !entry) continue;
      body.setPosition(entry.x, entry.y, entry.z);
      body.setRotation(body.rotation.x, entry.ry, body.rotation.z);
    }
  };

  return {
    channel: options.channel,
    flush,
    receive,
    update(dt) {
      accumulator += Math.max(dt, 0);
      if (accumulator < interval) return;
      accumulator = 0;
      flush();
    }
  };
}
