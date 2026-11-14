// A small React over the GUI tree: elements in, nodes out.
//
// Not a port of React. There is no fiber scheduler, no priority, no concurrent
// rendering - a state change re-renders the whole tree and diffs it against the
// previous one. For an interface of tens of nodes that is the right trade: the
// reconciler stays readable, and the only thing it has to be good at is not destroying
// nodes it did not have to.
//
// A host element's `type` is a GUI class name, so `React.createElement("TextLabel", ...)`
// builds the same node `Instance.new("TextLabel")` does. A component is a function that
// returns an element; hooks are keyed by the component's position in the render tree,
// which is why the same component can appear twice and hold two independent states.
//
// Props are written through the same proxy a script assigns to, so UDim2, Color3 and
// the enum names convert in one place rather than in a second table that would drift.

import { readProp } from '../runtime/types';
import { createGuiProxy } from '../runtime/luaGuiApi';
import type { GuiTreeStore } from './guiStore';
import { isGuiClass } from './guiTypes';

export type ComponentFn = (props: Record<string, unknown>) => unknown;

export interface VNode {
  type: string | ComponentFn;
  props: Record<string, unknown>;
  children: unknown[];
}

interface HostVNode {
  type: string;
  props: Record<string, unknown>;
  children: HostVNode[];
  /** Text children, used when the node has no explicit `Text` prop. */
  text: string;
}

interface Instance {
  type: string;
  id: string;
  props: Record<string, unknown>;
  children: Instance[];
  handlers: Map<string, () => void>;
}

const EVENT_PROPS = ['onClick', 'MouseButton1Click', 'Activated', 'onActivated'];

/** A Lua array may arrive as a JS array or as a 1-keyed object, depending on the shim. */
function toArray(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value;
  const out: unknown[] = [];
  for (let index = 1; ; index += 1) {
    const item = readProp(value, String(index));
    if (item === undefined || item === null) break;
    out.push(item);
  }
  return out;
}

function isVNode(value: unknown): value is VNode {
  return Boolean(value) && typeof value === 'object' && typeof readProp(value, 'type') !== 'undefined';
}

function sameDeps(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/** The root a hook call belongs to while a render is in progress. */
let activeRoot: ReactRoot | null = null;

/**
 * A setter outlives the render that created it: it is called from an event handler,
 * long after `activeRoot` has been cleared. The slot id carries the root's sequence
 * number and this map resolves it back, so the write lands on the tree that owns the
 * hook rather than on whichever root happens to be rendering.
 */
const slotOwners = new Map<string, ReactRoot>();
let rootSequence = 0;

export function hookSlot(initial: unknown): { value: unknown; slot: string } {
  if (!activeRoot) return { value: initial, slot: '' };
  return activeRoot.claimHook(initial);
}

export function setHookSlot(slot: string, value: unknown): void {
  slotOwners.get(slot)?.writeHook(slot, value);
}

export function registerEffect(effect: unknown, deps: unknown): void {
  activeRoot?.claimEffect(effect, deps);
}

export class ReactRoot {
  private tree: Instance | null = null;
  private element: VNode | null = null;
  private hooks = new Map<string, unknown>();
  private effects = new Map<string, { deps: unknown[]; cleanup?: () => void }>();
  private pendingEffects: { slot: string; effect: () => unknown; deps: unknown[] }[] = [];
  private readonly uid = (rootSequence += 1);
  private path = '';
  private cursor = 0;
  private rendering = false;
  private dirty = false;

  constructor(
    private readonly store: GuiTreeStore,
    private readonly parentId: string
  ) {}

  render(element: VNode | null): void {
    this.element = element;
    this.renderNow();
  }

  unmount(): void {
    for (const entry of this.effects.values()) entry.cleanup?.();
    this.effects.clear();
    for (const slot of this.hooks.keys()) slotOwners.delete(slot);
    this.hooks.clear();
    if (this.tree) this.destroy(this.tree);
    this.tree = null;
    this.element = null;
  }

  claimHook(initial: unknown): { value: unknown; slot: string } {
    const slot = `${this.uid}:${this.path}#${this.cursor}`;
    this.cursor += 1;
    if (!this.hooks.has(slot)) this.hooks.set(slot, initial);
    slotOwners.set(slot, this);
    return { value: this.hooks.get(slot), slot };
  }

  writeHook(slot: string, value: unknown): void {
    if (!slot) return;
    this.hooks.set(slot, value);
    this.schedule();
  }

  claimEffect(effect: unknown, deps: unknown): void {
    if (typeof effect !== 'function') return;
    const slot = `${this.uid}:${this.path}#${this.cursor}`;
    this.cursor += 1;
    this.pendingEffects.push({ slot, effect: effect as () => unknown, deps: toArray(deps) });
  }

  private schedule(): void {
    this.dirty = true;
    if (!this.rendering) this.renderNow();
  }

  private renderNow(): void {
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    this.rendering = true;
    const previous = activeRoot;
    activeRoot = this;
    try {
      // A state write during render marks the tree dirty; render again rather than
      // leaving the screen a frame behind.
      do {
        this.dirty = false;
        this.cursor = 0;
        this.pendingEffects = [];
        const host = this.expand(this.element, '');
        this.tree = this.reconcile(this.tree, host, this.parentId);
        this.flushEffects();
      } while (this.dirty);
    } finally {
      activeRoot = previous;
      this.rendering = false;
    }
  }

  private expand(node: unknown, path: string): HostVNode | null {
    if (!isVNode(node)) return null;
    const vnode = node as VNode;

    if (typeof vnode.type === 'function') {
      const savedPath = this.path;
      const savedCursor = this.cursor;
      this.path = path;
      this.cursor = 0;
      let rendered: unknown;
      try {
        rendered = vnode.type(vnode.props ?? {});
      } finally {
        this.path = savedPath;
        this.cursor = savedCursor;
      }
      return this.expand(rendered, path);
    }

    const text: string[] = [];
    const children: HostVNode[] = [];
    toArray(vnode.children).forEach((child, index) => {
      if (typeof child === 'string' || typeof child === 'number') {
        text.push(String(child));
        return;
      }
      const expanded = this.expand(child, `${path}/${index}`);
      if (expanded) children.push(expanded);
    });

    const props = (vnode.props ?? {}) as Record<string, unknown>;
    return { type: String(vnode.type), props, children, text: text.join('') };
  }

  private reconcile(prev: Instance | null, vnode: HostVNode | null, parentId: string): Instance | null {
    if (!vnode) {
      if (prev) this.destroy(prev);
      return null;
    }
    if (prev && prev.type === vnode.type) {
      this.applyProps(prev, vnode.props, vnode.text);
      const children: Instance[] = [];
      vnode.children.forEach((child, index) => {
        const next = this.reconcile(prev.children[index] ?? null, child, prev.id);
        if (next) children.push(next);
      });
      for (const extra of prev.children.slice(vnode.children.length)) this.destroy(extra);
      prev.children = children;
      prev.props = vnode.props;
      return prev;
    }
    if (prev) this.destroy(prev);
    return this.mountNode(vnode, parentId);
  }

  private mountNode(vnode: HostVNode, parentId: string): Instance | null {
    if (!isGuiClass(vnode.type)) return null;
    const node = this.store.create(vnode.type);
    this.store.setParent(node.id, parentId);
    const instance: Instance = {
      type: vnode.type,
      id: node.id,
      // Starts empty so the first applyProps writes every prop instead of skipping
      // them all as unchanged.
      props: {},
      children: [],
      handlers: new Map()
    };
    this.applyProps(instance, vnode.props, vnode.text);
    instance.props = vnode.props;
    vnode.children.forEach((child) => {
      const mounted = this.mountNode(child, node.id);
      if (mounted) instance.children.push(mounted);
    });
    return instance;
  }

  private applyProps(instance: Instance, props: Record<string, unknown>, text: string): void {
    const node = this.store.get(instance.id);
    if (!node) return;
    const proxy = createGuiProxy(this.store, node);

    for (const [key, value] of Object.entries(props)) {
      if (key === 'key' || key === 'children') continue;
      if (EVENT_PROPS.includes(key)) {
        if (instance.props[key] === value) continue;
        instance.handlers.get(key)?.();
        instance.handlers.set(key, this.store.onClick(instance.id, value as () => void));
        continue;
      }
      if (instance.props[key] === value) continue;
      proxy[key] = value;
    }

    if (text && props.Text === undefined && instance.props.Text === undefined) {
      proxy.Text = text;
    }
  }

  private flushEffects(): void {
    for (const pending of this.pendingEffects) {
      const previous = this.effects.get(pending.slot);
      if (previous && sameDeps(previous.deps, pending.deps)) continue;
      previous?.cleanup?.();
      const cleanup = pending.effect();
      this.effects.set(pending.slot, {
        deps: pending.deps,
        cleanup: typeof cleanup === 'function' ? (cleanup as () => void) : undefined
      });
    }
    this.pendingEffects = [];
  }

  private destroy(instance: Instance): void {
    for (const unsubscribe of instance.handlers.values()) unsubscribe();
    for (const child of instance.children) this.destroy(child);
    this.store.destroy(instance.id);
  }
}
