// Both script-driven overlays, in the order they stack.
//
// They are separate surfaces with separate stores: the GUI tree is what a game builds
// out of ScreenGuis, the HUD overlay is the card list `ui.setHud` writes. Keeping the
// pair in one component means a host mounts one element and gets the correct stacking,
// instead of every host repeating two imports and hoping the order matches.

import React from 'react';
import { LuaUIOverlay } from './LuaUIOverlay';
import { GuiTreeOverlay } from './GuiTreeOverlay';

export const LuaOverlays: React.FC = () => (
  <>
    <GuiTreeOverlay />
    <LuaUIOverlay />
  </>
);
