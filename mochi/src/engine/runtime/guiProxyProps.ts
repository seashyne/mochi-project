// The property half of a GUI node proxy.
//
// Thirty-seven bindings lived inside `luaGuiApi.ts` until that file reached its line
// ceiling. They are a table of conversions, not control flow, so they belong in their
// own module: one entry per property, each naming the node field it reads and writes.
//
// Every setter goes through `store.update`, so a property written from Lua and one
// written by the reconciler take the same path.

import {
  toAspectAxis,
  toFillDirection,
  toFontName,
  toImageScaleType,
  toScrollingDirection,
  toSortOrder,
  toXAlignName,
  toYAlignName
} from '../gui/guiEnums';
import type { GuiNode } from '../gui/guiTypes';
import type { GuiTreeStore } from '../gui/guiStore';
import { toUdim, toUdim2, toVector2 } from '../gui/guiValues';
import { defineAlias } from './luaProxyUtils';
import { parseColor } from './types';

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function bind(
  proxy: Record<string, unknown>,
  store: GuiTreeStore,
  node: GuiNode,
  names: string[],
  read: () => unknown,
  convert: (value: unknown) => Partial<GuiNode>
): void {
  defineAlias(proxy, names, read, (value) => store.update(node.id, convert(value)));
}

/** Attaches every writable property to a node proxy. */
export function attachGuiProperties(proxy: Record<string, unknown>, store: GuiTreeStore, node: GuiNode): void {
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
  bind(proxy, store, node, ['MinTextSize'], () => node.minTextSize, (value) => ({
    minTextSize: clamp(Number(value), 1, 200, node.minTextSize)
  }));
  bind(proxy, store, node, ['MaxTextSize'], () => node.maxTextSize, (value) => ({
    maxTextSize: clamp(Number(value), 1, 200, node.maxTextSize)
  }));
  bind(proxy, store, node, ['CanvasSize'], () => node.canvasSize, (value) => ({
    canvasSize: toUdim2(value, node.canvasSize)
  }));
  bind(proxy, store, node, ['CanvasPosition'], () => node.canvasPosition, (value) => ({
    canvasPosition: toVector2(value, node.canvasPosition)
  }));
  bind(proxy, store, node, ['ScrollingDirection'], () => node.scrollingDirection, (value) => ({
    scrollingDirection: toScrollingDirection(value, node.scrollingDirection)
  }));
  bind(proxy, store, node, ['ScrollingEnabled'], () => node.scrollingEnabled, (value) => ({
    scrollingEnabled: Boolean(value)
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

}
