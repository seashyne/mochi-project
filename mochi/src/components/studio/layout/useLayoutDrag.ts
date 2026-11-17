// Pointer Events API drag lifecycle manager with threshold detection and drop dispatching.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DRAG_THRESHOLD_PX } from './layoutDefaults';
import { calculateDropTarget, type PaneRectEntry } from './layoutDragOps';
import type { DragState, DropTarget, LayoutRect, StudioPanelId } from './layoutTypes';

export interface UseLayoutDragOptions {
  workspaceRef: React.RefObject<HTMLElement | null>;
  paneElementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  onDropTarget: (panelId: StudioPanelId, target: DropTarget) => void;
}

export function useLayoutDrag({
  workspaceRef,
  paneElementsRef,
  onDropTarget
}: UseLayoutDragOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  const onDropTargetRef = useRef(onDropTarget);
  onDropTargetRef.current = onDropTarget;

  const startDrag = useCallback(
    (panelId: StudioPanelId, sourcePaneId: string, e: React.PointerEvent) => {
      // Primary button only
      if (e.button !== 0) return;

      const initial: DragState = {
        panelId,
        sourcePaneId,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isThresholdMet: false,
        target: null
      };

      setDragState(initial);
    },
    []
  );

  const cancelDrag = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current) return;

      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      const dist = Math.hypot(dx, dy);
      const isThresholdMet = current.isThresholdMet || dist >= DRAG_THRESHOLD_PX;

      if (!isThresholdMet) {
        setDragState((prev) =>
          prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null
        );
        return;
      }

      // Compute bounding rectangles
      let workspaceRect: LayoutRect | null = null;
      if (workspaceRef.current) {
        const domRect = workspaceRef.current.getBoundingClientRect();
        workspaceRect = {
          left: domRect.left,
          top: domRect.top,
          width: domRect.width,
          height: domRect.height
        };
      }

      const paneRects: PaneRectEntry[] = [];
      paneElementsRef.current.forEach((el, paneId) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          paneRects.push({
            paneId,
            rect: {
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height
            }
          });
        }
      });

      const target = calculateDropTarget(
        e.clientX,
        e.clientY,
        workspaceRect,
        paneRects
      );

      setDragState({
        ...current,
        currentX: e.clientX,
        currentY: e.clientY,
        isThresholdMet: true,
        target
      });
    };

    const handlePointerUp = () => {
      const current = dragStateRef.current;
      if (current && current.isThresholdMet && current.target) {
        onDropTargetRef.current(current.panelId, current.target);
      }
      setDragState(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragState(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState !== null, paneElementsRef, workspaceRef]);

  return {
    dragState,
    startDrag,
    cancelDrag
  };
}
