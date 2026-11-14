// Everything a node proxy raises: per-frame, Touched, TouchEnded, Changed.
//
// Kept out of `luaNodeApi` because that file is the god-proxy and sits at the
// file-size ceiling; the signal wiring is a separable responsibility.

import type { LiveNode, LuaPlayerProxy, TouchHandler, UpdateHandler } from './liveNode';
import { lastFunction } from './luaProxyUtils';
import { addTouchEndedHandler } from './touchEnded';
import { connectChanged, emitChanged } from './nodeChanged';

export function attachNodeSignals(proxy: Record<string, unknown>, node: LiveNode): void {
  const connectTouch = (...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) node.addTouchHandler(handler as TouchHandler);
  };
  const connectTouchEnded = (...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) addTouchEndedHandler(node, handler as TouchHandler);
  };
  const connectUpdate = (...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) node.addUpdateHandler(handler as UpdateHandler);
  };
  const connectChangedHandler = (property: string | null, ...args: unknown[]) => {
    const handler = lastFunction(args);
    if (handler) connectChanged(node, property, handler as (name: string) => void);
  };

  proxy.onTouch = (...args: unknown[]) => connectTouch(...args);
  proxy.Touched = { Connect: connectTouch };
  proxy.TouchEnded = { Connect: connectTouchEnded };
  proxy.onUpdate = { Connect: connectUpdate };
  proxy.Changed = { Connect: (...args: unknown[]) => connectChangedHandler(null, ...args) };
  proxy.GetPropertyChangedSignal = (property: unknown) => ({
    Connect: (...args: unknown[]) => connectChangedHandler(String(property ?? ''), ...args)
  });
}

/** Raises `Changed` for a property written through the proxy. */
export function notifyChanged(node: LiveNode, property: string): void {
  emitChanged(node, property);
}

export type { LuaPlayerProxy };
