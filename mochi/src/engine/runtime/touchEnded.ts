// TouchEnded handlers, kept off the node.
//
// LiveNode already carries the per-frame and Touched callback lists and sits near the
// file-size ceiling, and a parallel agent is refactoring it. Keeping this list in a
// side table costs one WeakMap lookup on a path that runs once per contact edge, and
// keeps the node untouched.

import type { LiveNode, LuaPlayerProxy, TouchHandler } from './liveNode';

const handlers = new WeakMap<LiveNode, TouchHandler[]>();

export function addTouchEndedHandler(node: LiveNode, handler: TouchHandler): void {
  const list = handlers.get(node);
  if (list) list.push(handler);
  else handlers.set(node, [handler]);
}

export function touchEndedHandlerCount(node: LiveNode): number {
  return handlers.get(node)?.length ?? 0;
}

/** Copies the list first: a handler is allowed to add or remove handlers. */
export function emitTouchEnded(node: LiveNode, player: LuaPlayerProxy): void {
  for (const handler of [...(handlers.get(node) ?? [])]) {
    try {
      handler(player);
    } catch (error) {
      node.onError?.(error);
    }
  }
}
