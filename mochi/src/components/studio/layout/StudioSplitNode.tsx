// Flexbox split node container hosting two subtrees and a draggable divider.

import React, { useRef } from 'react';
import { useStudioLayoutContext } from './StudioLayoutContext';
import { StudioSplitter } from './StudioSplitter';
import type { LayoutNode, SplitNode } from './layoutTypes';

export interface StudioSplitNodeProps {
  node: SplitNode;
  renderChild: (child: LayoutNode) => React.ReactNode;
}

export const StudioSplitNode: React.FC<StudioSplitNodeProps> = ({
  node,
  renderChild
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resizeSplit } = useStudioLayoutContext();
  const isHorizontal = node.direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      data-split-id={node.id}
      className={`flex min-w-0 min-h-0 w-full h-full overflow-hidden ${
        isHorizontal ? 'flex-row' : 'flex-col'
      }`}
    >
      <div
        style={{
          flex: `${node.splitRatio} 1 0%`,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden'
        }}
        className="flex min-w-0 min-h-0"
      >
        {renderChild(node.first)}
      </div>

      <StudioSplitter
        splitId={node.id}
        direction={node.direction}
        splitRatio={node.splitRatio}
        containerRef={containerRef}
        onResize={(ratio) => resizeSplit(node.id, ratio)}
      />

      <div
        style={{
          flex: `${1 - node.splitRatio} 1 0%`,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden'
        }}
        className="flex min-w-0 min-h-0"
      >
        {renderChild(node.second)}
      </div>
    </div>
  );
};
