// The Lua face of the GUI tree: `Instance.new("ScreenGui")`, `UDim2`, `PlayerGui`.
//
// A GUI node is not a world node, so it gets its own proxy rather than a `LiveNode`
// one: the two share nothing except a name. The proxy is cached per store and node id,
// which is what makes `gui:FindFirstChild("Label") == label` true - identity is part of
// the contract a ported script relies on.

import { defaultGuiStore, GuiTreeStore } from '../gui/guiStore';
import type { GuiClass, GuiNode } from '../gui/guiTypes';
import { defineAlias } from './luaProxyUtils';
import { attachGuiProperties } from './guiProxyProps';
import { readProp } from './types';

const proxyOwner = new WeakMap<object, string>();
const proxyCache = new WeakMap<GuiTreeStore, Map<string, Record<string, unknown>>>();

export function guiNodeFromLuaValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return proxyOwner.get(value as object);
}

/** The canonical property names `Instance.new(class, parent, props)` accepts. */
export const GUI_PROPERTY_NAMES = [
  'Name',
  'Position',
  'Size',
  'AnchorPoint',
  'BackgroundColor3',
  'BackgroundTransparency',
  'BorderSizePixel',
  'Visible',
  'ZIndex',
  'Text',
  'TextColor3',
  'TextSize',
  'TextScaled',
  'Font',
  'TextXAlignment',
  'TextYAlignment',
  'CornerRadius',
  'PaddingTop',
  'PaddingBottom',
  'PaddingLeft',
  'PaddingRight',
  'Padding',
  'FillDirection',
  'HorizontalAlignment',
  'VerticalAlignment',
  'TextWrapped',
  'RichText',
  'ClipsDescendants',
  'LayoutOrder',
  'Scale',
  'AspectRatio',
  'DominantAxis',
  'SortOrder',
  'CellSize',
  'CellPadding',
  'Image',
  'ImageColor3',
  'ScaleType',
  'CanvasSize',
  'CanvasPosition',
  'ScrollingDirection',
  'ScrollingEnabled',
  'MinTextSize',
  'MaxTextSize'
] as const;

export function createGuiProxy(store: GuiTreeStore, node: GuiNode): Record<string, unknown> {
  let cache = proxyCache.get(store);
  if (!cache) {
    cache = new Map();
    proxyCache.set(store, cache);
  }
  const cached = cache.get(node.id);
  if (cached) return cached;

  const proxy: Record<string, unknown> = {};
  cache.set(node.id, proxy);
  proxyOwner.set(proxy, node.id);

  attachGuiProperties(proxy, store, node);

  defineAlias(proxy, ['ClassName', 'className'], () => node.className, () => undefined);
  defineAlias(
    proxy,
    ['Parent', 'parent'],
    () => {
      const parent = node.parentId ? store.get(node.parentId) : undefined;
      return parent ? createGuiProxy(store, parent) : undefined;
    },
    (value) => {
      // `gui.Parent = nil` detaches; anything that is not a GUI proxy is ignored
      // rather than detaching by accident.
      if (value === undefined || value === null) {
        store.setParent(node.id, null);
        return;
      }
      const target = guiNodeFromLuaValue(value);
      if (target) store.setParent(node.id, target);
    }
  );

  proxy.Destroy = () => store.destroy(node.id);
  proxy.FindFirstChild = (name: unknown) => {
    const wanted = String(name ?? '');
    const child = store.childrenOf(node.id).find((item) => item.name === wanted);
    return child ? createGuiProxy(store, child) : undefined;
  };
  proxy.GetChildren = () => store.childrenOf(node.id).map((child) => createGuiProxy(store, child));

  // Both names are the same event. The store owns the handler set, so the overlay can
  // fire it without knowing anything about Lua.
  const connectClick = (...args: unknown[]) => {
    const handler = [...args].reverse().find((value) => typeof value === 'function');
    if (typeof handler !== 'function') return { Disconnect: () => undefined };
    return { Disconnect: store.onClick(node.id, handler as () => void) };
  };
  proxy.MouseButton1Click = { Connect: connectClick };
  proxy.Activated = { Connect: connectClick };

  return proxy;
}

/** `Instance.new("Frame", parent, props)` for a GUI class. */
export function createGuiInstance(
  className: GuiClass,
  args: unknown[],
  store: GuiTreeStore = defaultGuiStore
): Record<string, unknown> {
  let parentId: string | undefined;
  let props: unknown;
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue;
    const owner = guiNodeFromLuaValue(arg);
    if (owner) parentId = owner;
    else if (props === undefined) props = arg;
  }

  const nameProp = readProp(props, 'Name') ?? readProp(props, 'name');
  const node = store.create(className, nameProp === undefined ? undefined : String(nameProp));
  const proxy = createGuiProxy(store, node);

  for (const key of GUI_PROPERTY_NAMES) {
    if (key === 'Name') continue;
    const value = readProp(props, key);
    if (value !== undefined) proxy[key] = value;
  }
  if (parentId) store.setParent(node.id, parentId);
  return proxy;
}

/** `player.PlayerGui`: the root every ScreenGui hangs from. */
export function createPlayerGuiProxy(store: GuiTreeStore = defaultGuiStore): Record<string, unknown> {
  const root = store.get(store.playerGuiId);
  if (!root) {
    // reset() always leaves a root; this is the only way it can be absent.
    store.reset();
    return createGuiProxy(store, store.get(store.playerGuiId)!);
  }
  return createGuiProxy(store, root);
}
