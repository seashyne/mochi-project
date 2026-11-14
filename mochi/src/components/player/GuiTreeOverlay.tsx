// Renders the script-built GUI tree over the viewport.
//
// Every node is absolutely positioned against its parent's box, which is exactly what
// a UDim2 means: scale is a percentage of the parent, offset is pixels. A list or grid
// layout on the parent replaces that - children flow in order and their Position is
// ignored, the same rule the source API uses.
//
// Physical `left`/`top` is deliberate, not an RTL oversight: a game interface is
// authored against a fixed box, and mirroring it would move a creator's layout out
// from under them. The app chrome is what flips; script content does not.

import React, { useEffect, useState } from 'react';
import { defaultGuiStore, GuiTreeStore } from '../../engine/gui/guiStore';
import {
  isButtonClass,
  isDecorationClass,
  isImageClass,
  isTextClass,
  type GuiNode
} from '../../engine/gui/guiTypes';
import { rgba, udim2Length, udimLength } from '../../engine/gui/guiValues';
import type { XAlignName, YAlignName } from '../../engine/gui/guiEnums';
import { GuiText } from './GuiScaledText';

/** How a node sits in its parent: free, in a list run, or filling a grid cell. */
type Flow = 'none' | 'list' | 'grid';

const JUSTIFY: Record<XAlignName, React.CSSProperties['justifyContent']> = {
  Left: 'flex-start',
  Center: 'center',
  Right: 'flex-end'
};

const ALIGN: Record<YAlignName, React.CSSProperties['alignItems']> = {
  Top: 'flex-start',
  Center: 'center',
  Bottom: 'flex-end'
};

const OBJECT_FIT: Record<string, React.CSSProperties['objectFit']> = {
  Stretch: 'fill',
  Fit: 'contain',
  Crop: 'cover'
};

function baseStyle(node: GuiNode, isButton: boolean, flow: Flow): React.CSSProperties {
  if (node.className === 'ScreenGui') {
    // A ScreenGui fills the viewport and is not a box of its own.
    return { position: 'absolute', inset: 0, zIndex: node.zIndex, pointerEvents: 'none' };
  }

  const style: React.CSSProperties = {
    position: flow === 'none' ? 'absolute' : 'relative',
    // A grid cell decides the size, so the child fills it rather than fighting it.
    width: flow === 'grid' ? '100%' : udim2Length('x', node.size),
    height: flow === 'grid' ? '100%' : udim2Length('y', node.size),
    backgroundColor: rgba(node.background, 1 - node.backgroundTransparency),
    border: node.borderSize > 0 ? `${node.borderSize}px solid rgba(0, 0, 0, 0.45)` : undefined,
    zIndex: node.zIndex,
    display: 'flex',
    justifyContent: JUSTIFY[node.xAlign],
    alignItems: ALIGN[node.yAlign],
    overflow: node.clipsDescendants ? 'hidden' : 'visible',
    // Only a button takes input. A full-screen frame that ate clicks would swallow
    // the movement controls underneath it.
    pointerEvents: isButton ? 'auto' : 'none',
    cursor: isButton ? 'pointer' : undefined
  };

  if (flow === 'none') {
    style.left = udim2Length('x', node.position);
    style.top = udim2Length('y', node.position);
    style.transform = `translate(${-node.anchor.x * 100}%, ${-node.anchor.y * 100}%)`;
  }
  return style;
}

function NodeView({
  node,
  store,
  flow
}: {
  node: GuiNode;
  store: GuiTreeStore;
  flow: Flow;
}): React.ReactElement | null {
  if (!node.visible || isDecorationClass(node.className)) return null;

  const isButton = isButtonClass(node.className);
  const corner = store.childOfClass(node.id, 'UICorner');
  const padding = store.childOfClass(node.id, 'UIPadding');
  const scaleNode = store.childOfClass(node.id, 'UIScale');
  const aspect = store.childOfClass(node.id, 'UIAspectRatioConstraint');
  const list = store.childOfClass(node.id, 'UIListLayout');
  const grid = store.childOfClass(node.id, 'UIGridLayout');
  const style = baseStyle(node, isButton, flow);

  if (corner) style.borderRadius = udimLength(corner.cornerRadius);
  if (padding) {
    // Absolute children position against the padding box, so this insets both the
    // free-positioned and the flowed cases without a wrapper element.
    style.padding = [
      padding.paddingTop,
      padding.paddingRight,
      padding.paddingBottom,
      padding.paddingLeft
    ]
      .map(udimLength)
      .join(' ');
  }
  if (aspect && aspect.aspectRatio > 0) {
    style.aspectRatio = String(aspect.aspectRatio);
    // The dominant axis keeps its UDim2 size; the other is derived from the ratio.
    if (aspect.aspectAxis === 'Width') style.height = 'auto';
    else style.width = 'auto';
  }
  if (scaleNode && scaleNode.scale !== 1) {
    // Scaled around the anchor point, which is where the source API scales from.
    style.transformOrigin = `${node.anchor.x * 100}% ${node.anchor.y * 100}%`;
    style.transform = `${style.transform ?? ''} scale(${scaleNode.scale})`.trim();
  }
  if (grid) {
    style.display = 'grid';
    style.gridTemplateColumns = `repeat(auto-fill, ${udim2Length('x', grid.cellSize)})`;
    style.gridAutoRows = udim2Length('y', grid.cellSize);
    style.gap = `${udim2Length('y', grid.cellPadding)} ${udim2Length('x', grid.cellPadding)}`;
    style.justifyContent = JUSTIFY[grid.listHAlign];
    style.alignContent = ALIGN[grid.listVAlign];
  } else if (list) {
    const vertical = list.fillDirection !== 'Horizontal';
    style.display = 'flex';
    style.flexDirection = vertical ? 'column' : 'row';
    style.gap = udimLength(list.listPadding);
    style.justifyContent = vertical ? ALIGN[list.listVAlign] : JUSTIFY[list.listHAlign];
    style.alignItems = vertical ? JUSTIFY[list.listHAlign] : ALIGN[list.listVAlign];
  }

  const childFlow: Flow = grid ? 'grid' : list ? 'list' : 'none';

  return (
    <div
      style={style}
      onClick={isButton ? () => store.fireClick(node.id) : undefined}
      data-gui={node.className}
    >
      {isImageClass(node.className) && node.image ? (
        <>
          <img
            src={node.image}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: OBJECT_FIT[node.imageScaleType],
              pointerEvents: 'none'
            }}
          />
          {/* ImageColor3 multiplies the image, which is what a multiply overlay does. */}
          {node.imageColor !== '#ffffff' ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: node.imageColor,
                mixBlendMode: 'multiply',
                pointerEvents: 'none'
              }}
            />
          ) : null}
        </>
      ) : null}
      {isTextClass(node.className) && node.text ? <GuiText node={node} /> : null}
      {store.arrangedChildrenOf(node.id).map((child) => (
        <NodeView key={child.id} node={child} store={store} flow={childFlow} />
      ))}
    </div>
  );
}

export interface GuiTreeOverlayProps {
  store?: GuiTreeStore;
}

export const GuiTreeOverlay: React.FC<GuiTreeOverlayProps> = ({ store = defaultGuiStore }) => {
  const [, bump] = useState(0);

  useEffect(() => {
    // The tree belongs to the mounted overlay. This effect runs before the host's,
    // which is where the runtime is created, so a game never starts on top of the
    // previous session's ScreenGuis.
    store.reset();
    return store.subscribe(() => bump((value) => value + 1));
  }, [store]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {store.roots().map((node) => (
        <NodeView key={node.id} node={node} store={store} flow="none" />
      ))}
    </div>
  );
};
