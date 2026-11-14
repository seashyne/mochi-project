// The overlay actually draws what the store holds.
//
// Rendered to a string rather than mounted: the component reads the tree at render
// time and only needs a subscriber for updates, so the markup is the whole contract.
// A GUI that renders nowhere is the failure mode this test exists to catch.

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { GuiTreeStore } from '../src/engine/gui/guiStore';
import { GuiTreeOverlay } from '../src/components/player/GuiTreeOverlay';

function build(): GuiTreeStore {
  const store = new GuiTreeStore();
  const screen = store.create('ScreenGui', 'Hud');
  // A node is not drawn until it is parented, so the screen hangs from PlayerGui.
  store.setParent(screen.id, store.playerGuiId);
  const frame = store.create('Frame', 'Panel');
  store.setParent(frame.id, screen.id);
  store.update(frame.id, {
    position: { xScale: 0, xOffset: 20, yScale: 0, yOffset: 30 },
    size: { xScale: 0, xOffset: 200, yScale: 0, yOffset: 80 },
    background: '#101820',
    backgroundTransparency: 0.25
  });

  const label = store.create('TextLabel', 'Title');
  store.setParent(label.id, frame.id);
  store.update(label.id, { text: 'Score 10', textColor: '#ff0000', textSize: 24 });
  return store;
}

describe('GuiTreeOverlay', () => {
  it('renders the nested tree with resolved positions and colours', () => {
    const html = renderToString(<GuiTreeOverlay store={build()} />);

    expect(html).toContain('data-gui="ScreenGui"');
    expect(html).toContain('data-gui="Frame"');
    expect(html).toContain('data-gui="TextLabel"');
    expect(html).toContain('Score 10');
    expect(html).toContain('left:20px');
    expect(html).toContain('width:200px');
    expect(html).toContain('height:80px');
    expect(html).toContain('color:#ff0000');
    expect(html).toContain('font-size:24px');
  });

  it('turns scale into a percentage of the parent', () => {
    const store = build();
    const frame = store.roots()[0] && store.childrenOf(store.roots()[0].id)[0];
    store.update(frame!.id, { size: { xScale: 1, xOffset: 0, yScale: 0.5, yOffset: 0 } });

    const html = renderToString(<GuiTreeOverlay store={store} />);
    expect(html).toContain('width:100%');
    expect(html).toContain('height:50%');
  });

  it('applies transparency to the background only', () => {
    const html = renderToString(<GuiTreeOverlay store={build()} />);
    // #101820 at 0.75 alpha, with the text colour left untouched.
    expect(html).toContain('rgba(16, 24, 32, 0.75)');
  });

  it('draws nothing for a hidden node or its children', () => {
    const store = build();
    const screen = store.roots()[0];
    store.update(screen.id, { visible: false });

    const html = renderToString(<GuiTreeOverlay store={store} />);
    expect(html).not.toContain('Score 10');
    expect(html).not.toContain('data-gui="Frame"');
  });

  it('rounds the box that carries a UICorner', () => {
    const store = build();
    const panel = store.childrenOf(store.roots()[0].id)[0];
    const corner = store.create('UICorner', 'UICorner');
    store.setParent(corner.id, panel.id);
    store.update(corner.id, { cornerRadius: { scale: 0, offset: 12 } });

    const html = renderToString(<GuiTreeOverlay store={store} />);
    expect(html).toContain('border-radius:12px');
    // A decoration node is not a box of its own.
    expect(html).not.toContain('data-gui="UICorner"');
  });

  it('insets children by the UIPadding on their parent', () => {
    const store = build();
    const panel = store.childrenOf(store.roots()[0].id)[0];
    const pad = store.create('UIPadding', 'UIPadding');
    store.setParent(pad.id, panel.id);
    store.update(pad.id, {
      paddingTop: { scale: 0, offset: 4 },
      paddingRight: { scale: 0, offset: 6 },
      paddingBottom: { scale: 0, offset: 8 },
      paddingLeft: { scale: 0, offset: 10 }
    });

    const html = renderToString(<GuiTreeOverlay store={store} />);
    // CSS shorthand order: top right bottom left.
    expect(html).toContain('padding:4px 6px 8px 10px');
  });

  it('flows children when the parent carries a UIListLayout', () => {
    const store = build();
    const panel = store.childrenOf(store.roots()[0].id)[0];
    const layout = store.create('UIListLayout', 'UIListLayout');
    store.setParent(layout.id, panel.id);
    store.update(layout.id, {
      listPadding: { scale: 0, offset: 6 },
      fillDirection: 'Horizontal'
    });

    const html = renderToString(<GuiTreeOverlay store={store} />);
    expect(html).toContain('flex-direction:row');
    expect(html).toContain('gap:6px');
    // The label is a flex item now, so its Position is ignored rather than applied.
    expect(html).toContain('position:relative');
    expect(html).not.toContain('left:0px');
  });
});
