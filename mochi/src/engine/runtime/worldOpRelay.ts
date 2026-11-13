// Peer world edits: announce what this client spawned or destroyed, and replay a
// peer's edit without echoing it back. Split out of GameRuntime so the session
// class stays under the size ceiling.

import type { LiveNode } from './liveNode';
import type { RuntimeWorld } from './objectRegistry';
import type { RuntimeNetworkAdapter, WorldOp } from './types';
import { serializeNode } from './worldOpSerialize';

export class WorldOpRelay {
  private applyingRemote = false;

  constructor(
    private readonly world: RuntimeWorld,
    private readonly network: RuntimeNetworkAdapter | undefined,
    private readonly disposeContext: (id: string) => void,
    private readonly isDisposed: () => boolean
  ) {}

  /** Subscribes to a peer's ops; returns the detach function, or null offline. */
  attach(): (() => void) | null {
    return this.network?.onWorldOp?.((op) => this.apply(op)) ?? null;
  }

  spawn(node: LiveNode): void {
    if (this.applyingRemote || !node.dynamic || node.remote) return;
    this.network?.sendWorldOp?.({ kind: 'spawn', object: serializeNode(node.def) });
  }

  destroy(node: LiveNode): void {
    if (this.applyingRemote || !node.dynamic || node.remote) return;
    this.network?.sendWorldOp?.({ kind: 'destroy', id: node.id });
  }

  private apply(op: WorldOp): void {
    if (this.isDisposed()) return;
    this.applyingRemote = true;
    try {
      if (op.kind === 'spawn' && op.object) {
        if (this.world.get(op.object.id)) return;
        const node = this.world.spawn({ ...op.object, luaScript: undefined }, { dynamic: true });
        node.remote = true;
        return;
      }
      if (op.kind === 'destroy' && op.id) {
        this.disposeContext(op.id);
        this.world.destroy(op.id);
      }
    } finally {
      this.applyingRemote = false;
    }
  }
}
