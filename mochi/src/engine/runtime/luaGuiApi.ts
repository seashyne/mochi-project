// The Lua face of the GUI tree: `Instance.new("ScreenGui")`, `UDim2`, `PlayerGui`.
//
// A GUI node is not a world node, so it gets its own proxy rather than a `LiveNode`
// one: the two share nothing except a name. The proxy is cached per store and node id,
// which is what makes `gui:FindFirstChild("Label") == label` true - identity is part of
// the contract a ported script relies on.

import { defaultGuiStore, GuiTreeStore } from '../gui/guiStore';
import type { GuiClass, GuiNode } from '../gui/guiTypes';
import {
  toAspectAxis,
  toFillDirection,
  toFontName,
  toImageScaleType,
  toSortOrder,
  toXAlignName,
  toYAlignName
} from '../gui/guiEnums';
import { toUdim, toUdim2, toVector2 } from '../gui/guiValues';
import { defineAlias } from './luaProxyUtils';
import { parseColor, readProp } from './types';

const proxyOwner = new WeakMap<object, string>();
const proxyCache = new WeakMap<GuiTreeStore, Map<string, Record<string, unknown>>>();

export function guiNodeFromLuaValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return proxyOwner.get(value as object);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
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
  'ScaleType'
] as const;

type Store = GuiTreeStore;

function bind(
  proxy: Record<string, unknown>,
  store: Store,
  node: GuiNode,
  names: string[],
  read: () => unknown,
  convert: (value: unknown) => Partial<GuiNode>
): void {
  defineAlias(proxy, names, read, (value) => store.update(node.id, convert(value)));
}

/** Builds (or returns) the proxy for one node. */
export function createGuiProxy(store: Store, node: GuiNode): Record<string, unknown> {
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

  bind(proxy, store, node, ['Name', 'name'], () => node.name, (value) => ({
    name: String(value ?? '').trim() || node.name
  }));
  bind(proxy, store, node, ['Position', 'position'], () => node.position, (value) => ({
    position: toUdim2(value, node.position)
  }));
  bind(proxy, store, node, ['Size', 'size'], () => node.size, (value) => ({
    size: toUdim2(value, node.size)
  }));
  bind(proxy, store, node, ['AnchorPoint', 'anchorPoint'], () => node.anchor, (value) => ({
    anchor: toVector2(value, node.anchor)
  }));
  bind(proxy, store, node, ['BackgroundColor3', 'backgroundColor3'], () => node.background, (value) => ({
    background: parseColor(value, node.background)
  }));
  bind(proxy, store, node, ['BackgroundTransparency'], () => node.backgroundTransparency, (value) => ({
    backgroundTransparency: clamp(Number(value), 0, 1, node.backgroundTransparency)
  }));
  bind(proxy, store, node, ['BorderSizePixel'], () => node.borderSize, (value) => ({
    borderSize: clamp(Number(value), 0, 32, node.borderSize)
  }));
  bind(proxy, store, node, ['Visible', 'visible'], () => node.visible, (value) => ({
    visible: Boolean(value)
  }));
  bind(proxy, store, node, ['ZIndex'], () => node.zIndex, (value) => ({
    zIndex: Number.isFinite(Number(value)) ? Number(value) : node.zIndex
  }));
  bind(proxy, store, node, ['Text', 'text'], () => node.text, (value) => ({
    text: String(value ?? '')
  }));
  bind(proxy, store, node, ['TextColor3', 'textColor3'], () => node.textColor, (value) => ({
    textColor: parseColor(value, node.textColor)
  }));
  bind(proxy, store, node, ['TextSize', 'textSize'], () => node.textSize, (value) => ({
    textSize: clamp(Number(value), 8, 96, node.textSize)
  }));
  bind(proxy, store, node, ['TextScaled', 'textScaled'], () => node.textScaled, (value) => ({
    textScaled: Boolean(value)
  }));
  bind(proxy, store, node, ['Font', 'font'], () => node.font, (value) => ({
    font: toFontName(value, node.font)
  }));
  bind(proxy, store, node, ['TextXAlignment'], () => node.xAlign, (value) => ({
    xAlign: toXAlignName(value, node.xAlign)
  }));
  bind(proxy, store, node, ['TextYAlignment'], () => node.yAlign, (value) => ({
    yAlign: toYAlignName(value, node.yAlign)
  }));

  bind(proxy, store, node, ['CornerRadius'], () => node.cornerRadius, (value) => ({
    cornerRadius: toUdim(value, node.cornerRadius)
  }));
  bind(proxy, store, node, ['PaddingTop'], () => node.paddingTop, (value) => ({
    paddingTop: toUdim(value, node.paddingTop)
  }));
  bind(proxy, store, node, ['PaddingBottom'], () => node.paddingBottom, (value) => ({
    paddingBottom: toUdim(value, node.paddingBottom)
  }));
  bind(proxy, store, node, ['PaddingLeft'], () => node.paddingLeft, (value) => ({
    paddingLeft: toUdim(value, node.paddingLeft)
  }));
  bind(proxy, store, node, ['PaddingRight'], () => node.paddingRight, (value) => ({
    paddingRight: toUdim(value, node.paddingRight)
  }));
  bind(proxy, store, node, ['Padding'], () => node.listPadding, (value) => ({
    listPadding: toUdim(value, node.listPadding)
  }));
  bind(proxy, store, node, ['FillDirection'], () => node.fillDirection, (value) => ({
    fillDirection: toFillDirection(value, node.fillDirection)
  }));
  bind(proxy, store, node, ['HorizontalAlignment'], () => node.listHAlign, (value) => ({
    listHAlign: toXAlignName(value, node.listHAlign)
  }));
  bind(proxy, store, node, ['VerticalAlignment'], () => node.listVAlign, (value) => ({
    listVAlign: toYAlignName(value, node.listVAlign)
  }));

  bind(proxy, store, node, ['TextWrapped'], () => node.textWrapped, (value) => ({
    textWrapped: Boolean(value)
  }));
  bind(proxy, store, node, ['ClipsDescendants'], () => node.clipsDescendants, (value) => ({
    clipsDescendants: Boolean(value)
  }));
  bind(proxy, store, node, ['LayoutOrder'], () => node.layoutOrder, (value) => ({
    layoutOrder: Number.isFinite(Number(value)) ? Number(value) : node.layoutOrder
  }));
  bind(proxy, store, node, ['Scale'], () => node.scale, (value) => ({
    scale: clamp(Number(value), 0.05, 10, node.scale)
  }));
  bind(proxy, store, node, ['AspectRatio'], () => node.aspectRatio, (value) => ({
    aspectRatio: clamp(Number(value), 0, 100, node.aspectRatio)
  }));
  bind(proxy, store, node, ['DominantAxis'], () => node.aspectAxis, (value) => ({
    aspectAxis: toAspectAxis(value, node.aspectAxis)
  }));
  bind(proxy, store, node, ['SortOrder'], () => node.sortOrder, (value) => ({
    sortOrder: toSortOrder(value, node.sortOrder)
  }));
  bind(proxy, store, node, ['CellSize'], () => node.cellSize, (value) => ({
    cellSize: toUdim2(value, node.cellSize)
  }));
  bind(proxy, store, node, ['CellPadding'], () => node.cellPadding, (value) => ({
    cellPadding: toUdim2(value, node.cellPadding)
  }));
  bind(proxy, store, node, ['Image'], () => node.image, (value) => ({
    image: String(value ?? '')
  }));
  bind(proxy, store, node, ['ImageColor3'], () => node.imageColor, (value) => ({
    imageColor: parseColor(value, node.imageColor)
  }));
  bind(proxy, store, node, ['ScaleType'], () => node.imageScaleType, (value) => ({
    imageScaleType: toImageScaleType(value, node.imageScaleType)
  }));

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
  store: Store = defaultGuiStore
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
export function createPlayerGuiProxy(store: Store = defaultGuiStore): Record<string, unknown> {
  const root = store.get(store.playerGuiId);
  if (!root) {
    // reset() always leaves a root; this is the only way it can be absent.
    store.reset();
    return createGuiProxy(store, store.get(store.playerGuiId)!);
  }
  return createGuiProxy(store, root);
}
