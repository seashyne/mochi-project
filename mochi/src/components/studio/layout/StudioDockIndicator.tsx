// Translucent drop indicator rectangle and 5-zone diamond dock preview overlay.

import React from 'react';
import { PANEL_METADATA } from './layoutDefaults';
import type { DragState, DropTarget } from './layoutTypes';

export interface StudioDockIndicatorProps {
  dragState: DragState | null;
  target: DropTarget | null;
}

export const StudioDockIndicator: React.FC<StudioDockIndicatorProps> = ({
  dragState,
  target
}) => {
  if (!dragState || !dragState.isThresholdMet) return null;

  return (
    <>
      {/* Fullscreen pointer overlay to prevent canvas / iframe pointer traps */}
      <div className="fixed inset-0 select-none cursor-grabbing z-40 pointer-events-none" />

      {/* Dock preview highlight rectangle */}
      {target && (
        <div
          data-testid="dock-indicator"
          style={{
            position: 'fixed',
            left: target.rect.left,
            top: target.rect.top,
            width: target.rect.width,
            height: target.rect.height,
            pointerEvents: 'none',
            zIndex: 50
          }}
          className="bg-studio-accent/20 border-2 border-dashed border-studio-accent rounded transition-all duration-75"
        />
      )}

      {/* Floating drag chip attached to pointer */}
      <div
        data-testid="dock-drag-chip"
        style={{
          position: 'fixed',
          left: dragState.currentX + 12,
          top: dragState.currentY + 12,
          pointerEvents: 'none',
          zIndex: 60
        }}
        className="px-2.5 py-1 bg-studio-card border border-studio-border rounded shadow-lg text-[11px] font-medium text-studio-text flex items-center gap-1.5 opacity-95 select-none"
      >
        <span className="w-2 h-2 rounded-full bg-studio-accent" />
        <span>
          {PANEL_METADATA[dragState.panelId]?.title ?? dragState.panelId}
        </span>
      </div>
    </>
  );
};
