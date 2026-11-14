// The enum surface the GUI classes expose.
//
// A property stores the enum *name*, not the internal family. That is what makes
// `label.Font == Enum.Font.Code` true: the member is the same string, and a string
// survives the host boundary where an object would lose its identity.
//
// Readers are total. `Enum.Font.Code`, `"Code"` and `"code"` all land on the same
// value; anything unrecognised keeps the fallback rather than throwing, because a
// typo in a style hint must not kill a script.

import type { LuaHudFont } from '../lua/types';
import { readProp } from '../runtime/types';

/** Sans faces. Everything the app can approximate with its UI family. */
const UI_FONTS = [
  'Legacy',
  'Arial',
  'ArialBold',
  'SourceSans',
  'SourceSansBold',
  'SourceSansSemibold',
  'SourceSansLight',
  'SourceSansItalic',
  'Gotham',
  'GothamMedium',
  'GothamBold',
  'GothamBlack',
  'Roboto',
  'RobotoCondensed',
  'BuilderSans',
  'BuilderSansMedium',
  'BuilderSansBold',
  'BuilderSansExtraBold',
  'Unknown'
] as const;

/** Fixed-width faces. */
const MONO_FONTS = ['Code', 'RobotoMono'] as const;

/** Display faces: the ones whose personality is lost anyway when substituted. */
const DISPLAY_FONTS = [
  'Bodoni',
  'Garamond',
  'Cartoon',
  'Highway',
  'SciFi',
  'Arcade',
  'Fantasy',
  'Antique',
  'AmaticSC',
  'Bangers',
  'Creepster',
  'DenkOne',
  'Fondamento',
  'FredokaOne',
  'GrenzeGotisch',
  'IndieFlower',
  'JosefinSans',
  'Jura',
  'Kalam',
  'LuckiestGuy',
  'Merriweather',
  'Michroma',
  'Nunito',
  'Oswald',
  'PatrickHand',
  'PermanentMarker',
  'Sarpanch',
  'SpecialElite',
  'TitilliumWeb',
  'Ubuntu'
] as const;

export const FONT_NAMES = [...UI_FONTS, ...MONO_FONTS, ...DISPLAY_FONTS];
export type FontName = (typeof FONT_NAMES)[number];

export const X_ALIGN_NAMES = ['Left', 'Center', 'Right'] as const;
export type XAlignName = (typeof X_ALIGN_NAMES)[number];

export const Y_ALIGN_NAMES = ['Top', 'Center', 'Bottom'] as const;
export type YAlignName = (typeof Y_ALIGN_NAMES)[number];

/** `Enum.HorizontalAlignment` and `Enum.VerticalAlignment` reuse the same members. */
export const HORIZONTAL_ALIGNMENTS = X_ALIGN_NAMES;
export const VERTICAL_ALIGNMENTS = Y_ALIGN_NAMES;

export const FILL_DIRECTIONS = ['Vertical', 'Horizontal'] as const;
export type FillDirectionName = (typeof FILL_DIRECTIONS)[number];

/** Which axes a ScrollingFrame scrolls on. */
export const SCROLLING_DIRECTIONS = ['X', 'Y', 'XY'] as const;
export type ScrollingDirectionName = (typeof SCROLLING_DIRECTIONS)[number];

/** How a list or grid orders its children. */
export const SORT_ORDERS = ['LayoutOrder', 'Name'] as const;
export type SortOrderName = (typeof SORT_ORDERS)[number];

/** Which axis an aspect-ratio constraint takes its measurement from. */
export const ASPECT_AXES = ['Width', 'Height'] as const;
export type AspectAxisName = (typeof ASPECT_AXES)[number];

/** How an image fills its box. */
export const IMAGE_SCALE_TYPES = ['Stretch', 'Fit', 'Crop'] as const;
export type ImageScaleTypeName = (typeof IMAGE_SCALE_TYPES)[number];

/** `TweenService` easing curves and the direction they run in. */


const FAMILY = new Map<string, LuaHudFont>();
for (const name of UI_FONTS) FAMILY.set(name, 'ui');
for (const name of MONO_FONTS) FAMILY.set(name, 'mono');
for (const name of DISPLAY_FONTS) FAMILY.set(name, 'display');

/** The shipped family a name renders with. Every name has one, by construction. */
export function familyFor(name: FontName): LuaHudFont {
  return FAMILY.get(name) ?? 'ui';
}

/**
 * `"RobotoMono"`, `"roboto mono"` and `{ Name = "RobotoMono" }` all reduce to the same
 * key, so the comparison below only has to deal with one spelling.
 */
function normalize(value: unknown): string {
  const raw = typeof value === 'string' ? value : readProp(value, 'Name');
  return typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function pickFrom<T extends string>(names: readonly T[], value: unknown, fallback: T): T {
  const wanted = normalize(value);
  if (!wanted) return fallback;
  for (const name of names) {
    if (name.toLowerCase() === wanted) return name;
  }
  return fallback;
}

export function toFontName(value: unknown, fallback: FontName): FontName {
  return pickFrom(FONT_NAMES, value, fallback);
}

export function toXAlignName(value: unknown, fallback: XAlignName): XAlignName {
  return pickFrom(X_ALIGN_NAMES, value, fallback);
}

export function toYAlignName(value: unknown, fallback: YAlignName): YAlignName {
  return pickFrom(Y_ALIGN_NAMES, value, fallback);
}

export function toFillDirection(value: unknown, fallback: FillDirectionName): FillDirectionName {
  return pickFrom(FILL_DIRECTIONS, value, fallback);
}

export function toScrollingDirection(
  value: unknown,
  fallback: ScrollingDirectionName
): ScrollingDirectionName {
  return pickFrom(SCROLLING_DIRECTIONS, value, fallback);
}

export function toSortOrder(value: unknown, fallback: SortOrderName): SortOrderName {
  return pickFrom(SORT_ORDERS, value, fallback);
}

export function toAspectAxis(value: unknown, fallback: AspectAxisName): AspectAxisName {
  return pickFrom(ASPECT_AXES, value, fallback);
}

export function toImageScaleType(value: unknown, fallback: ImageScaleTypeName): ImageScaleTypeName {
  return pickFrom(IMAGE_SCALE_TYPES, value, fallback);
}
