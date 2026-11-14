// The font stacks the two Lua-driven overlays render with.
//
// Shared so the HUD cards and the script-built GUI cannot drift: a creator picks one
// of three families, and both surfaces resolve it the same way. Only faces the app
// already ships appear here - a game can never ask the browser to fetch a font.

import type { LuaHudFont } from '../../engine/lua/types';

export const HUD_FONT_STACK: Record<LuaHudFont, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  ui: "'IBM Plex Sans Thai', system-ui, sans-serif",
  display: "'Mitr', 'IBM Plex Sans Thai', sans-serif"
};
