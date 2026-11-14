// A ScrollingFrame: a clipped box with a canvas larger than it.
//
// `CanvasPosition` is the source of truth, not the DOM scroll offset. A script that
// sets it has to move the view, and a wheel turn has to be readable from the script,
// so the two are kept in step in both directions: the effect pushes the store's value
// into the element, and the scroll event writes the element's value back.
//
// The canvas is a real child sized by `CanvasSize`, which is what lets absolute
// children inside it position against the canvas rather than the visible box.

import React, { useEffect, useRef } from 'react';
import type { GuiTreeStore } from '../../engine/gui/guiStore';
import type { GuiNode } from '../../engine/gui/guiTypes';
import { udim2Length } from '../../engine/gui/guiValues';

export const GuiScrollingFrame: React.FC<{
  node: GuiNode;
  store: GuiTreeStore;
  style: React.CSSProperties;
  children: React.ReactNode;
}> = ({ node, store, style, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { x, y } = node.canvasPosition;
    // A half-pixel of slack: the browser rounds scroll offsets, and writing on every
    // fractional difference would fight the scroll event that produced it.
    if (Math.abs(element.scrollLeft - x) > 0.5) element.scrollLeft = x;
    if (Math.abs(element.scrollTop - y) > 0.5) element.scrollTop = y;
  }, [node.canvasPosition.x, node.canvasPosition.y]);

  const axis = node.scrollingDirection;
  const overflowX = !node.scrollingEnabled || axis === 'Y' ? 'hidden' : 'auto';
  const overflowY = !node.scrollingEnabled || axis === 'X' ? 'hidden' : 'auto';

  return (
    <div
      ref={ref}
      data-gui={node.className}
      style={{
        ...style,
        overflowX,
        overflowY,
        // The canvas starts at the top-left corner; the node's own alignment applies
        // to text, not to the canvas.
        justifyContent: 'flex-start',
        alignItems: 'flex-start'
      }}
      onScroll={() => {
        const element = ref.current;
        if (!element) return;
        store.update(node.id, {
          canvasPosition: { x: element.scrollLeft, y: element.scrollTop }
        });
      }}
    >
      <div
        style={{
          position: 'relative',
          width: udim2Length('x', node.canvasSize),
          height: udim2Length('y', node.canvasSize)
        }}
      >
        {children}
      </div>
    </div>
  );
};
