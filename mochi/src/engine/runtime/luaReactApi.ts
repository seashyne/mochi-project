// The private half of the React surface: `__mochi_*` primitives.
//
// The public table (`React.createElement`, `React.useState`, ...) is defined in Lua by
// `luaPreludeReact.ts`, because `useState` has to return two values and a JS function
// can only return one. These are the functions that need to cross the boundary; the
// shape a script sees is assembled on the other side.
//
// A mount is keyed by its parent node, so mounting twice into the same container
// re-renders the existing root instead of stacking a second tree on top of it.

import { ReactRoot, hookSlot, registerEffect, setHookSlot, type VNode } from '../gui/reactLua';
import { defaultGuiStore, type GuiTreeStore } from '../gui/guiStore';
import { guiNodeFromLuaValue } from './luaGuiApi';
import { readProp } from './types';

export function createReactApi(store: GuiTreeStore = defaultGuiStore): Record<string, unknown> {
  const roots = new Map<string, ReactRoot>();

  const rootFor = (parent: unknown): ReactRoot => {
    const parentId = guiNodeFromLuaValue(parent) ?? store.playerGuiId;
    const existing = roots.get(parentId);
    if (existing) return existing;
    const root = new ReactRoot(store, parentId);
    roots.set(parentId, root);
    return root;
  };

  return {
    /** `React.createElement` in Lua calls this once it has collected the varargs. */
    __mochi_create: (type: unknown, props: unknown, children: unknown) => ({
      type,
      props: props && typeof props === 'object' ? props : {},
      children: children ?? []
    }),

    __mochi_hook: (initial: unknown) => hookSlot(initial),
    __mochi_hook_set: (slot: unknown, value: unknown) => setHookSlot(String(slot ?? ''), value),
    __mochi_effect: (effect: unknown, deps: unknown) => registerEffect(effect, deps),

    __mochi_mount: (element: unknown, parent: unknown) => {
      const root = rootFor(parent);
      root.render(element as VNode);
      return {
        unmount: () => {
          root.unmount();
          roots.delete(guiNodeFromLuaValue(parent) ?? store.playerGuiId);
        }
      };
    },

    /** `root:render(element)` and `root.render(element)` both work: the last argument wins. */
    __mochi_create_root: (parent: unknown) => {
      const root = rootFor(parent);
      return {
        render: (...args: unknown[]) => {
          const element = args.length > 0 ? args[args.length - 1] : undefined;
          if (!readProp(element, 'type') && element !== null) return;
          root.render(element as VNode);
        },
        unmount: () => root.unmount()
      };
    }
  };
}
