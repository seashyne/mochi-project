// Geometric hit-testing for drag-and-drop docking zones and visual preview bounding boxes.

import type { DropTarget, DropZone, LayoutRect } from './layoutTypes';

export const WINDOW_EDGE_THRESHOLD_PX = 24;

export interface PaneRectEntry {
  paneId: string;
  rect: LayoutRect;
}

export function isPointInsideRect(x: number, y: number, rect: LayoutRect): boolean {
  return (
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height
  );
}

export function computePreviewRect(
  zone: DropZone,
  baseRect: LayoutRect
): LayoutRect {
  switch (zone) {
    case 'tab':
      return { ...baseRect };
    case 'left':
      return {
        left: baseRect.left,
        top: baseRect.top,
        width: baseRect.width * 0.5,
        height: baseRect.height
      };
    case 'right':
      return {
        left: baseRect.left + baseRect.width * 0.5,
        top: baseRect.top,
        width: baseRect.width * 0.5,
        height: baseRect.height
      };
    case 'top':
      return {
        left: baseRect.left,
        top: baseRect.top,
        width: baseRect.width,
        height: baseRect.height * 0.5
      };
    case 'bottom':
      return {
        left: baseRect.left,
        top: baseRect.top + baseRect.height * 0.5,
        width: baseRect.width,
        height: baseRect.height * 0.5
      };
    case 'window-left':
      return {
        left: baseRect.left,
        top: baseRect.top,
        width: baseRect.width * 0.25,
        height: baseRect.height
      };
    case 'window-right':
      return {
        left: baseRect.left + baseRect.width * 0.75,
        top: baseRect.top,
        width: baseRect.width * 0.25,
        height: baseRect.height
      };
    case 'window-top':
      return {
        left: baseRect.left,
        top: baseRect.top,
        width: baseRect.width,
        height: baseRect.height * 0.25
      };
    case 'window-bottom':
      return {
        left: baseRect.left,
        top: baseRect.top + baseRect.height * 0.75,
        width: baseRect.width,
        height: baseRect.height * 0.25
      };
  }
}

export function calculateDropTarget(
  pointerX: number,
  pointerY: number,
  workspaceRect: LayoutRect | null,
  paneRects: PaneRectEntry[],
  edgeThreshold = WINDOW_EDGE_THRESHOLD_PX
): DropTarget | null {
  if (workspaceRect && isPointInsideRect(pointerX, pointerY, workspaceRect)) {
    const dLeft = pointerX - workspaceRect.left;
    const dRight = workspaceRect.left + workspaceRect.width - pointerX;
    const dTop = pointerY - workspaceRect.top;
    const dBottom = workspaceRect.top + workspaceRect.height - pointerY;

    if (dLeft < edgeThreshold) {
      return {
        zone: 'window-left',
        rect: computePreviewRect('window-left', workspaceRect)
      };
    }
    if (dRight < edgeThreshold) {
      return {
        zone: 'window-right',
        rect: computePreviewRect('window-right', workspaceRect)
      };
    }
    if (dTop < edgeThreshold) {
      return {
        zone: 'window-top',
        rect: computePreviewRect('window-top', workspaceRect)
      };
    }
    if (dBottom < edgeThreshold) {
      return {
        zone: 'window-bottom',
        rect: computePreviewRect('window-bottom', workspaceRect)
      };
    }
  }

  for (const entry of paneRects) {
    if (isPointInsideRect(pointerX, pointerY, entry.rect)) {
      const nx = (pointerX - entry.rect.left) / entry.rect.width;
      const ny = (pointerY - entry.rect.top) / entry.rect.height;

      // Center 40% initiates tab grouping
      if (nx >= 0.3 && nx <= 0.7 && ny >= 0.3 && ny <= 0.7) {
        return {
          paneId: entry.paneId,
          zone: 'tab',
          rect: computePreviewRect('tab', entry.rect)
        };
      }

      // Proximity to closest border
      const distLeft = nx;
      const distRight = 1 - nx;
      const distTop = ny;
      const distBottom = 1 - ny;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      let zone: DropZone = 'tab';
      if (minDist === distLeft) zone = 'left';
      else if (minDist === distRight) zone = 'right';
      else if (minDist === distTop) zone = 'top';
      else if (minDist === distBottom) zone = 'bottom';

      return {
        paneId: entry.paneId,
        zone,
        rect: computePreviewRect(zone, entry.rect)
      };
    }
  }

  return null;
}
