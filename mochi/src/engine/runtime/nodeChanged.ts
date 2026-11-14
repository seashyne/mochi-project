// `Changed` and `GetPropertyChangedSignal`, kept in a side table.
//
// LiveNode is at the file-size ceiling and a parallel agent is refactoring it, so the
// listeners live here instead. A listener registered without a property sees every
// change; one registered for a property sees only that name.
//
// Scope, stated plainly: these fire for writes that go through the Lua proxy. A part
// moved by physics does not raise `Changed` - the proxy would have to diff every node
// every frame to know, and that cost belongs to a decision, not to this file.

import type { LiveNode } from './liveNode';

export type ChangedHandler = (property: string) => void;

interface Listener {
  /** null listens to every property. */
  property: string | null;
  handler: ChangedHandler;
}

const listeners = new WeakMap<LiveNode, Listener[]>();

export function connectChanged(node: LiveNode, property: string | null, handler: ChangedHandler): void {
  const list = listeners.get(node);
  if (list) list.push({ property, handler });
  else listeners.set(node, [{ property, handler }]);
}

/** Fires every listener for this property, and every listener that wants them all. */
export function emitChanged(node: LiveNode, property: string): void {
  const list = listeners.get(node);
  if (!list || list.length === 0) return;

  // Copied first: a handler may connect or disconnect while this loop runs.
  for (const listener of [...list]) {
    if (listener.property !== null && listener.property !== property) continue;
    try {
      listener.handler(property);
    } catch (error) {
      node.onError?.(error);
    }
  }
}
