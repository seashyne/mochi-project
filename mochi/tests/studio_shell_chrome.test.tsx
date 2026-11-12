// Studio shell chrome: ribbon tabs and group bodies, the title-bar menus, the
// status bar readout and the editor shell's panel slots.
//
// These are the surfaces the old StudioToolbar used to own, so this suite is the
// regression net for the shell refactor.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioRibbon } from '../src/components/studio/shell/StudioRibbon';
import { StudioMenuBar } from '../src/components/studio/shell/StudioMenuBar';
import { StudioStatusBar } from '../src/components/studio/shell/StudioStatusBar';
import { StudioEditorShell } from '../src/components/studio/shell/StudioEditorShell';
import { PART_MENU, BRUSHES, GIZMO_TOOLS } from '../src/components/studio/shell/ribbonCatalog';
import type { StudioRibbonTab } from '../src/components/studio/shell/ribbonTypes';
import { ALL_PANELS, menuActions, plain, ribbonActions } from './shellFixtures';

const TABS: StudioRibbonTab[] = ['home', 'model', 'terrain', 'script', 'animation', 'publish'];

describe('Studio ribbon', () => {
  it('renders every tab as a stable test hook plus its label', () => {
    const html = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    TABS.forEach((tab) => {
      expect(html).toContain(`data-testid="studio-ribbon-tab-${tab}"`);
    });
    ['Home', 'Model', 'Terrain', 'Script', 'Animation', 'Publish'].forEach((label) => {
      expect(html).toContain(`>${label}<`);
    });
  });

  it('marks only the active tab with the accent underline', () => {
    const html = renderToString(<StudioRibbon activeTab="terrain" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(html).toContain('bg-studio-card/60');
    expect(html.split('bg-studio-card/60').length - 1).toBe(1);
    expect(html).toContain('border-studio-accent');
  });

  it('swaps the group body with the active tab', () => {
    const home = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(home).toContain('Playtest');
    expect(home).toContain('Snap to grid');

    const terrain = renderToString(<StudioRibbon activeTab="terrain" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(terrain).toContain('Sculpt');
    expect(terrain).not.toContain('Playtest Scene');

    const publish = renderToString(<StudioRibbon activeTab="publish" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(publish).toContain('Release');
    expect(publish).toContain('Publish');
  });

  it('disables selection-dependent actions when nothing is selected', () => {
    const idle = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(idle).toContain('opacity-35 cursor-not-allowed');

    const selected = renderToString(
      <StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions({ hasSelection: true, canUndo: true })} />
    );
    expect(selected).toContain('Undo');
  });

  it('reports the saving state on the save button', () => {
    const html = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions({ isSaving: true })} />);
    expect(html).toContain('Saving');
  });
});

describe('Ribbon catalog', () => {
  it('lists one entry per insertable part type', () => {
    const types = PART_MENU.map((item) => item.type);
    expect(types).toHaveLength(12);
    expect(new Set(types).size).toBe(12);
    expect(types).toEqual(
      expect.arrayContaining(['block', 'sphere', 'cylinder', 'ramp', 'platform', 'terrain', 'constraint', 'particle'])
    );
  });

  it('lists the six terrain brushes and three gizmo modes', () => {
    expect(BRUSHES.map((brush) => brush.tool)).toEqual(['raise', 'lower', 'smooth', 'flatten', 'paint', 'erase']);
    expect(GIZMO_TOOLS.map((tool) => tool.mode)).toEqual(['translate', 'rotate', 'scale']);
  });
});

describe('Studio menu bar', () => {
  it('shows the document name and marks unsaved edits', () => {
    const clean = renderToString(<StudioMenuBar documentName="Neon Obby" actions={menuActions()} />);
    expect(clean).toContain('Neon Obby');
    expect(clean).toContain('Mochi Studio');
    expect(plain(clean)).not.toContain('Neon Obby *');

    const dirty = renderToString(<StudioMenuBar documentName="Neon Obby" isDirty actions={menuActions()} />);
    expect(plain(dirty)).toContain('Neon Obby *');
  });

  it('renders the four top-level menus', () => {
    const html = renderToString(<StudioMenuBar documentName="Doc" actions={menuActions()} />);
    ['File', 'Edit', 'View', 'Test'].forEach((label) => expect(html).toContain(`>${label}<`));
  });

  it('keeps dropdowns closed until a menu is opened', () => {
    const html = renderToString(<StudioMenuBar documentName="Doc" actions={menuActions()} />);
    expect(html).not.toContain('Publish Release...');
    expect(html).not.toContain('Playtest Scene');
  });

  it('renders the collaborate affordance only when a handler exists', () => {
    const without = renderToString(<StudioMenuBar documentName="Doc" actions={menuActions()} />);
    expect(without).not.toContain('Collaborate');

    const withHandler = renderToString(
      <StudioMenuBar documentName="Doc" actions={menuActions()} onCollaborate={vi.fn()} />
    );
    expect(withHandler).toContain('Collaborate');
  });
});

describe('Studio status bar', () => {
  it('renders the part count, clock and sky readout', () => {
    const html = renderToString(
      <StudioStatusBar partCount={12} selectionLabel={null} clockLabel="14:30" skyLabel="Clear Dawn" isDirty={false} onCommand={vi.fn()} />
    );
    expect(plain(html)).toContain('12 parts');
    expect(html).toContain('14:30');
    expect(html).toContain('Clear Dawn');
  });

  it('shows the selection label when a part is selected', () => {
    const html = renderToString(
      <StudioStatusBar partCount={1} selectionLabel="Block_7" clockLabel="06:00" skyLabel="Dawn" isDirty={false} onCommand={vi.fn()} />
    );
    expect(html).toContain('Block_7');
  });

  it('switches the save badge between unsaved and saved', () => {
    const unsaved = renderToString(
      <StudioStatusBar partCount={0} selectionLabel={null} clockLabel="06:00" skyLabel="Dawn" isDirty onCommand={vi.fn()} />
    );
    expect(unsaved).toContain('Unsaved');

    const saved = renderToString(
      <StudioStatusBar partCount={0} selectionLabel={null} clockLabel="06:00" skyLabel="Dawn" isDirty={false} lastSavedAt="17:04" onCommand={vi.fn()} />
    );
    expect(saved).toContain('Saved 17:04');
  });

  it('exposes the command line with its shortcut hint', () => {
    const html = renderToString(
      <StudioStatusBar partCount={0} selectionLabel={null} clockLabel="06:00" skyLabel="Dawn" isDirty={false} onCommand={vi.fn()} />
    );
    expect(html).toContain('Ctrl+/');
    expect(html).toContain('<form');
  });
});

describe('Studio editor shell', () => {
  const renderShell = (panels: typeof ALL_PANELS) =>
    renderToString(
      <StudioEditorShell
        documentName="Doc"
        isDirty={false}
        panels={panels}
        ribbonTab="home"
        onRibbonTab={vi.fn()}
        ribbonActions={ribbonActions()}
        menuActions={menuActions()}
        toolbox={<span>TOOLBOX_SLOT</span>}
        viewport={<span>VIEWPORT_SLOT</span>}
        explorer={<span>EXPLORER_SLOT</span>}
        properties={<span>PROPERTIES_SLOT</span>}
        output={<span>OUTPUT_SLOT</span>}
        status={{ partCount: 3, selectionLabel: null, clockLabel: '12:00', skyLabel: 'Noon', isDirty: false, onCommand: vi.fn() }}
      />
    );

  it('renders every slot when all docks are open', () => {
    const html = renderShell(ALL_PANELS);
    ['TOOLBOX_SLOT', 'VIEWPORT_SLOT', 'EXPLORER_SLOT', 'PROPERTIES_SLOT', 'OUTPUT_SLOT'].forEach((slot) => {
      expect(html).toContain(slot);
    });
    expect(plain(html)).toContain('3 parts');
  });

  it('drops the docks that are toggled off but keeps the viewport', () => {
    const html = renderShell({ toolbox: false, explorer: false, properties: false, output: false });
    expect(html).not.toContain('TOOLBOX_SLOT');
    expect(html).not.toContain('EXPLORER_SLOT');
    expect(html).not.toContain('PROPERTIES_SLOT');
    expect(html).not.toContain('OUTPUT_SLOT');
    expect(html).toContain('VIEWPORT_SLOT');
  });

  it('keeps the right dock when only one of explorer or properties is open', () => {
    const explorerOnly = renderShell({ toolbox: true, explorer: true, properties: false, output: true });
    expect(explorerOnly).toContain('EXPLORER_SLOT');
    expect(explorerOnly).not.toContain('PROPERTIES_SLOT');

    const propertiesOnly = renderShell({ toolbox: true, explorer: false, properties: true, output: true });
    expect(propertiesOnly).toContain('PROPERTIES_SLOT');
    expect(propertiesOnly).not.toContain('EXPLORER_SLOT');
  });
});
