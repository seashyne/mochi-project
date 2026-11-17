// SSR and component tests for Studio workspace layout components: tabs, splitters, overlays, and shell chrome.

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  StudioDockContainer,
  StudioDockIndicator,
  StudioLayoutProvider,
  StudioSplitter,
  StudioTabBar,
  StudioTabPane,
  type DragState,
  type DropTarget,
  type LayoutContextValue,
  type TabPaneNode
} from '../src/components/studio/layout';
import { createDefaultLayout } from '../src/components/studio/layout/layoutDefaults';

describe('StudioTabBar component', () => {
  it('renders tab list and individual tabs with proper accessibility attributes', () => {
    const html = renderToString(
      <StudioTabBar
        paneId="pane_test"
        tabs={['explorer', 'properties']}
        activeTabId="explorer"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onStartDragTab={vi.fn()}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="studio-dock-tab-explorer"');
    expect(html).toContain('data-testid="studio-dock-tab-properties"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
  });

  it('applies studio accent styling to the active tab', () => {
    const html = renderToString(
      <StudioTabBar
        paneId="pane_test"
        tabs={['explorer', 'properties']}
        activeTabId="properties"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onStartDragTab={vi.fn()}
      />
    );

    // Active tab has border-studio-accent and bg-studio-panel
    expect(html).toContain('border-studio-accent');
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('text-studio-text');
  });

  it('renders close buttons for closable panels but omits for viewport', () => {
    const closableHtml = renderToString(
      <StudioTabBar
        paneId="pane_test"
        tabs={['explorer']}
        activeTabId="explorer"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onStartDragTab={vi.fn()}
      />
    );
    expect(closableHtml).toContain('data-testid="studio-dock-tab-close-explorer"');

    const viewportHtml = renderToString(
      <StudioTabBar
        paneId="pane_test"
        tabs={['viewport']}
        activeTabId="viewport"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onStartDragTab={vi.fn()}
      />
    );
    expect(viewportHtml).not.toContain('data-testid="studio-dock-tab-close-viewport"');
  });

  it('stops pointer down propagation on close button and handles keyboard selection', () => {
    const onSelect = vi.fn();
    const tree = StudioTabBar({
      paneId: 'pane_test',
      tabs: ['explorer'],
      activeTabId: 'explorer',
      onSelectTab: onSelect,
      onCloseTab: vi.fn(),
      onStartDragTab: vi.fn()
    });

    const tab = tree.props.children[0];
    const preventDefault = vi.fn();
    tab.props.onKeyDown({ key: 'Enter', preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('explorer');

    const closeBtn = tab.props.children[2];
    const stopPropagation = vi.fn();
    closeBtn.props.onPointerDown({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  });
});

describe('StudioSplitter component', () => {
  it('renders horizontal splitter divider with column resize cursor', () => {
    const ref = { current: null };
    const html = renderToString(
      <StudioSplitter
        splitId="split_h"
        direction="horizontal"
        splitRatio={0.4}
        containerRef={ref}
        onResize={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="dock-splitter-horizontal"');
    expect(html).toContain('cursor-col-resize');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuenow="40"');
  });

  it('renders vertical splitter divider with row resize cursor', () => {
    const ref = { current: null };
    const html = renderToString(
      <StudioSplitter
        splitId="split_v"
        direction="vertical"
        splitRatio={0.65}
        containerRef={ref}
        onResize={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="dock-splitter-vertical"');
    expect(html).toContain('cursor-row-resize');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('aria-valuenow="65"');
  });
});

describe('StudioDockIndicator component', () => {
  it('renders drop indicator and drag chip during active drag', () => {
    const dragState: DragState = {
      panelId: 'explorer',
      sourcePaneId: 'pane_explorer',
      startX: 100,
      startY: 100,
      currentX: 350,
      currentY: 250,
      isThresholdMet: true,
      target: {
        paneId: 'pane_viewport',
        zone: 'left',
        rect: { left: 200, top: 100, width: 300, height: 400 }
      }
    };

    const target: DropTarget = dragState.target!;
    const html = renderToString(
      <StudioDockIndicator dragState={dragState} target={target} />
    );

    expect(html).toContain('data-testid="dock-indicator"');
    expect(html).toContain('data-testid="dock-drag-chip"');
    expect(html).toContain('bg-studio-accent/20');
    expect(html).toContain('border-studio-accent');
    expect(html).toContain('Explorer');
  });

  it('renders nothing when not dragging or threshold is not met', () => {
    const idleHtml = renderToString(
      <StudioDockIndicator dragState={null} target={null} />
    );
    expect(idleHtml).toBe('');

    const subThresholdState: DragState = {
      panelId: 'explorer',
      sourcePaneId: 'pane_explorer',
      startX: 100,
      startY: 100,
      currentX: 102,
      currentY: 101,
      isThresholdMet: false,
      target: null
    };

    const belowThresholdHtml = renderToString(
      <StudioDockIndicator dragState={subThresholdState} target={null} />
    );
    expect(belowThresholdHtml).toBe('');
  });
});

describe('StudioTabPane component', () => {
  it('renders pane header and mounts the active slot content', () => {
    const pane: TabPaneNode = {
      id: 'pane_demo',
      type: 'pane',
      tabs: ['explorer', 'properties'],
      activeTabId: 'explorer'
    };

    const mockContext: LayoutContextValue = {
      layout: pane,
      slots: {
        explorer: <div data-testid="explorer-slot-content">EXPLORER CONTENT</div>,
        properties: <div data-testid="properties-slot-content">PROPERTIES CONTENT</div>
      },
      dragState: null,
      activePanels: { explorer: true, properties: true },
      selectTab: vi.fn(),
      closePanel: vi.fn(),
      resizeSplit: vi.fn(),
      startDrag: vi.fn(),
      resetLayout: vi.fn(),
      registerPaneRect: vi.fn()
    };

    const html = renderToString(
      <StudioLayoutProvider value={mockContext}>
        <StudioTabPane pane={pane} />
      </StudioLayoutProvider>
    );

    expect(html).toContain('data-pane-id="pane_demo"');
    expect(html).toContain('data-testid="explorer-slot-content"');
    expect(html).toContain('EXPLORER CONTENT');
    // Inactive tab content should not be displayed in active area
    expect(html).not.toContain('PROPERTIES CONTENT');
  });
});

describe('StudioDockContainer component', () => {
  it('renders default tree layout with all slots mounted', () => {
    const html = renderToString(
      <StudioDockContainer
        slots={{
          toolbox: <div data-testid="slot-toolbox">TOOLBOX</div>,
          viewport: <div data-testid="slot-viewport">VIEWPORT</div>,
          output: <div data-testid="slot-output">OUTPUT</div>,
          explorer: <div data-testid="slot-explorer">EXPLORER</div>,
          properties: <div data-testid="slot-properties">PROPERTIES</div>
        }}
      />
    );

    expect(html).toContain('data-testid="studio-dock-container"');
    expect(html).toContain('data-testid="slot-toolbox"');
    expect(html).toContain('data-testid="slot-viewport"');
    expect(html).toContain('data-testid="slot-output"');
    expect(html).toContain('data-testid="slot-explorer"');
    expect(html).toContain('data-testid="slot-properties"');
  });

  it('prunes toggled off docks while keeping the viewport', () => {
    const html = renderToString(
      <StudioDockContainer
        slots={{
          toolbox: <div>TOOLBOX</div>,
          viewport: <div>VIEWPORT</div>,
          output: <div>OUTPUT</div>,
          explorer: <div>EXPLORER</div>,
          properties: <div>PROPERTIES</div>
        }}
        panels={{
          toolbox: false,
          explorer: false,
          properties: false,
          output: false
        }}
      />
    );

    expect(html).toContain('VIEWPORT');
    expect(html).not.toContain('TOOLBOX');
    expect(html).not.toContain('EXPLORER');
    expect(html).not.toContain('PROPERTIES');
    expect(html).not.toContain('OUTPUT');
  });
});
