// Root workspace dock container rendering the recursive split tree and dock overlays.

import React, { useCallback, useMemo, useRef } from 'react';
import { filterTreeByVisibility } from './layoutMutations';
import { isPaneNode } from './layoutTreeOps';
import type { LayoutContextValue, LayoutNode, StudioPanelSlots } from './layoutTypes';
import { StudioDockIndicator } from './StudioDockIndicator';
import { StudioLayoutProvider } from './StudioLayoutContext';
import { StudioSplitNode } from './StudioSplitNode';
import { StudioTabPane } from './StudioTabPane';
import { useLayoutDrag } from './useLayoutDrag';
import { useStudioLayout } from './useStudioLayout';

export interface StudioDockContainerProps {
  slots: StudioPanelSlots;
  panels?: Record<string, boolean>;
  initialLayout?: LayoutNode;
  className?: string;
}

export const StudioDockContainer: React.FC<StudioDockContainerProps> = ({
  slots,
  panels,
  initialLayout,
  className
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const paneElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const {
    layout,
    selectTab,
    closePanel,
    resizeSplit,
    resetLayout,
    handleDropTarget
  } = useStudioLayout(initialLayout);

  const { dragState, startDrag } = useLayoutDrag({
    workspaceRef,
    paneElementsRef,
    onDropTarget: handleDropTarget
  });

  const registerPaneRect = useCallback(
    (paneId: string, element: HTMLElement | null) => {
      if (element) {
        paneElementsRef.current.set(paneId, element);
      } else {
        paneElementsRef.current.delete(paneId);
      }
    },
    []
  );

  const effectiveLayout = useMemo(() => {
    if (!panels) return layout;
    const filtered = filterTreeByVisibility(layout, panels);
    if (!filtered) {
      // Fallback to standalone viewport if everything else is hidden
      return {
        id: 'pane_viewport',
        type: 'pane' as const,
        tabs: ['viewport' as const],
        activeTabId: 'viewport' as const
      };
    }
    return filtered;
  }, [layout, panels]);

  const contextValue = useMemo<LayoutContextValue>(
    () => ({
      layout: effectiveLayout,
      slots,
      dragState,
      activePanels: panels ?? {},
      selectTab,
      closePanel,
      resizeSplit,
      startDrag,
      resetLayout,
      registerPaneRect
    }),
    [
      effectiveLayout,
      slots,
      dragState,
      panels,
      selectTab,
      closePanel,
      resizeSplit,
      startDrag,
      resetLayout,
      registerPaneRect
    ]
  );

  const renderNode = (node: LayoutNode): React.ReactNode => {
    if (isPaneNode(node)) {
      return <StudioTabPane key={node.id} pane={node} />;
    }
    return (
      <StudioSplitNode
        key={node.id}
        node={node}
        renderChild={renderNode}
      />
    );
  };

  return (
    <StudioLayoutProvider value={contextValue}>
      <div
        ref={workspaceRef}
        data-testid="studio-dock-container"
        className={`flex-1 flex min-w-0 min-h-0 w-full h-full relative overflow-hidden bg-studio-bg ${
          className ?? ''
        }`}
      >
        {renderNode(effectiveLayout)}
        <StudioDockIndicator
          dragState={dragState}
          target={dragState?.target ?? null}
        />
      </div>
    </StudioLayoutProvider>
  );
};
