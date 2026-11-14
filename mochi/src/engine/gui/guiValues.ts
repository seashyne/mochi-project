// Values a GUI script hands to a property: UDim2, Color3, Vector2, alignments.
//
// The Lua side builds plain tables, so every reader here is total: a malformed value
// returns the fallback instead of throwing. A typo in a GUI property must not be able
// to kill a script - the same rule the HUD style whitelist follows.

import { readNumber } from '../runtime/types';

export interface UDim2 {
  xScale: number;
  xOffset: number;
  yScale: number;
  yOffset: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

/** One axis of scale plus offset: a corner radius, a padding, a gap. */
export interface UDim {
  scale: number;
  offset: number;
}

export const ZERO_UDIM: UDim = { scale: 0, offset: 0 };
export const ZERO_UDIM2: UDim2 = { xScale: 0, xOffset: 0, yScale: 0, yOffset: 0 };
export const FULL_UDIM2: UDim2 = { xScale: 1, xOffset: 0, yScale: 1, yOffset: 0 };

/** Reads a UDim2 table; a partial table keeps the fallback for what it omits. */
export function toUdim2(value: unknown, fallback: UDim2): UDim2 {
  const xScale = readNumber(value, ['xScale', 'XScale', 'ScaleX']);
  const xOffset = readNumber(value, ['xOffset', 'XOffset', 'OffsetX']);
  const yScale = readNumber(value, ['yScale', 'YScale', 'ScaleY']);
  const yOffset = readNumber(value, ['yOffset', 'YOffset', 'OffsetY']);
  if (xScale === undefined && xOffset === undefined && yScale === undefined && yOffset === undefined) {
    return fallback;
  }
  return {
    xScale: xScale ?? fallback.xScale,
    xOffset: xOffset ?? fallback.xOffset,
    yScale: yScale ?? fallback.yScale,
    yOffset: yOffset ?? fallback.yOffset
  };
}

/**
 * The CSS length for one axis. A child is measured against its parent's box, and
 * a percentage inside an absolutely positioned parent does exactly that, so scale and
 * offset compose without measuring anything at render time.
 */
export function udim2Length(axis: 'x' | 'y', value: UDim2): string {
  const scale = axis === 'x' ? value.xScale : value.yScale;
  const offset = axis === 'x' ? value.xOffset : value.yOffset;
  if (!scale) return `${offset}px`;
  if (!offset) return `${scale * 100}%`;
  return `calc(${scale * 100}% + ${offset}px)`;
}

export function toUdim(value: unknown, fallback: UDim): UDim {
  const scale = readNumber(value, ['scale', 'Scale']);
  const offset = readNumber(value, ['offset', 'Offset']);
  if (scale === undefined && offset === undefined) return fallback;
  return { scale: scale ?? fallback.scale, offset: offset ?? fallback.offset };
}

/** The CSS length for a single-axis UDim. */
export function udimLength(value: UDim): string {
  if (!value.scale) return `${value.offset}px`;
  if (!value.offset) return `${value.scale * 100}%`;
  return `calc(${value.scale * 100}% + ${value.offset}px)`;
}

export function toVector2(value: unknown, fallback: Vector2): Vector2 {
  const x = readNumber(value, ['x', 'X']);
  const y = readNumber(value, ['y', 'Y']);
  if (x === undefined && y === undefined) return fallback;
  return { x: x ?? fallback.x, y: y ?? fallback.y };
}

/** `#rrggbb` plus an alpha, so transparency does not fade the text with it. */
export function rgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  if (!Number.isFinite(value)) return `rgba(0, 0, 0, ${alpha})`;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
