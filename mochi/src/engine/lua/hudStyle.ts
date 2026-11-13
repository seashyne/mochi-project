// One whitelist for HUD styling.
//
// Two Lua surfaces build a HUD element from a script table: the runtime API in
// `runtime/luaGlobals.ts` and the legacy script bridge in `lua/reactLuaBridge.ts`.
// Both used to carry their own list of accepted keys, which is how a field added to
// one silently disappears in the other. The rules live here instead.

import type { LuaHudFont, LuaHudSize } from './types';

/**
 * Families a creator can choose. Every entry is a face the app already ships, so a
 * game can never ask the browser for a font that has to be fetched or licensed.
 * `mono` is the default because that is what the HUD rendered before this existed.
 */
export const HUD_FONTS: readonly LuaHudFont[] = ['mono', 'ui', 'display'];

/** Value sizes, `md` being the previous fixed size. */
export const HUD_SIZES: readonly LuaHudSize[] = ['sm', 'md', 'lg'];

/**
 * Narrows a script-supplied value to the allowed set. Anything else returns
 * undefined rather than throwing: a typo in a style hint must not kill a script.
 */
export function pickHudFont(raw: unknown): LuaHudFont | undefined {
  return typeof raw === 'string' && (HUD_FONTS as readonly string[]).includes(raw)
    ? (raw as LuaHudFont)
    : undefined;
}

export function pickHudSize(raw: unknown): LuaHudSize | undefined {
  return typeof raw === 'string' && (HUD_SIZES as readonly string[]).includes(raw)
    ? (raw as LuaHudSize)
    : undefined;
}
