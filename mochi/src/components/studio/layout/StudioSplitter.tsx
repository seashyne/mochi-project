// Draggable horizontal and vertical splitter divider between layout panes.

import React, { useCallback, useRef } from 'react';
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO } from './layoutDefaults';
import type { SplitDirection } from './layoutTypes';

export interface StudioSplitterProps {
  splitId: string;
  direction: SplitDirection;
  splitRatio: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResize: (newRatio: number) => void;
}

export const StudioSplitter: React.FC<StudioSplitterProps> = ({
  direction,
  splitRatio,
  containerRef,
  onResize
}) => {
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      isDraggingRef.current = true;

      const container = containerRef.current;
      if (!container) return;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        let rawRatio = 0.5;
        if (direction === 'horizontal') {
          const offset = moveEvent.clientX - rect.left;
          rawRatio = rect.width > 0 ? offset / rect.width : 0.5;
        } else {
          const offset = moveEvent.clientY - rect.top;
          rawRatio = rect.height > 0 ? offset / rect.height : 0.5;
        }

        const clamped = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, rawRatio));
        onResize(clamped);
      };

      const handlePointerUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [containerRef, direction, onResize]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let delta = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        delta = -0.05;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        delta = 0.05;
      }
      if (delta !== 0) {
        e.preventDefault();
        const next = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, splitRatio + delta));
        onResize(Math.round(next * 100) / 100);
      }
    },
    [splitRatio, onResize]
  );

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(splitRatio * 100)}
      aria-valuemin={5}
      aria-valuemax={95}
      data-testid={isHorizontal ? 'dock-splitter-horizontal' : 'dock-splitter-vertical'}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={`relative shrink-0 select-none bg-studio-border hover:bg-studio-accent/70 active:bg-studio-accent transition-colors ${
        isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
      }`}
    >
      {/* Expanded invisible hit area */}
      <div
        className={`absolute ${
          isHorizontal ? 'inset-y-0 -inset-x-1' : 'inset-x-0 -inset-y-1'
        }`}
      />
    </div>
  );
};
