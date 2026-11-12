// Studio shell docks: properties grid, part property schema, the output
// console and the toolbox tab strip.
//
// Every assertion targets behaviour the page relies on, so a shell regression
// fails here instead of surfacing in the editor.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioPropertiesPanel } from '../src/components/studio/shell/StudioPropertiesPanel';
import { StudioObjectProperties } from '../src/components/studio/shell/StudioObjectProperties';
import { StudioOutputPanel } from '../src/components/studio/shell/StudioOutputPanel';
import { StudioToolboxPanel } from '../src/components/studio/shell/StudioToolboxPanel';
import { PropertyGroupsView } from '../src/components/studio/shell/propertyControls';
import type { StudioLogEntry } from '../src/components/studio/shell/useStudioSystemLog';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import { DEFAULT_TERRAIN_BRUSH } from '../src/engine/studio/advancedTypes';
import { part, plain } from './shellFixtures';

describe('Studio properties dock', () => {
  const render = (overrides: Partial<React.ComponentProps<typeof StudioPropertiesPanel>> = {}) =>
    renderToString(
      <StudioPropertiesPanel
        selectedObject={null}
        selectedService={null}
        selectedCount={0}
        objects={[]}
        environment={STARTER_ENVIRONMENT}
        onEnvironmentChange={vi.fn()}
        onUpdateObject={vi.fn()}
        {...overrides}
      />
    );

  it('shows the empty state when nothing is selected', () => {
    const html = render();
    expect(html).toContain('No Selection');
    expect(html).toContain('Nothing is selected');
  });

  it('renders the lighting schema with clock, ambient and sun rows', () => {
    const html = render({ selectedService: 'lighting', onEnvironmentReset: vi.fn() });
    expect(html).toContain('ClockTime');
    expect(html).toContain('Ambient');
    expect(html).toContain('ExposureCompensation');
    expect(html).toContain('SunAzimuth');
    expect(html).toContain('Reset to starter environment');
  });

  it('renders the sky schema with the skybox picker', () => {
    const html = render({ selectedService: 'sky' });
    expect(html).toContain('Skybox');
    expect(html).toContain('SunIntensity');
  });

  it('renders the atmosphere schema with the fog toggle', () => {
    const html = render({ selectedService: 'atmosphere' });
    expect(html).toContain('Density');
    expect(html).toContain('role="switch"');
  });

  it('renders the selected part schema with its name in the header', () => {
    const html = render({ selectedObject: part({ name: 'Hero_Block' }), selectedCount: 1 });
    expect(html).toContain('Hero_Block');
    expect(html).toContain('Position');
    expect(html).toContain('Orientation');
  });

  it('warns when several parts are selected', () => {
    const html = render({ selectedObject: part({ name: 'Primary' }), selectedCount: 3 });
    expect(plain(html)).toContain('3 parts selected');
    expect(html).toContain('Primary');
  });

  it('exposes the filter box', () => {
    expect(render()).toContain('placeholder="Filter"');
  });
});

describe('Part property schema', () => {
  const html = renderToString(
    <StudioObjectProperties object={part({ rotation: { x: 0, y: Math.PI / 2, z: 0 } })} onUpdate={vi.fn()} />
  );

  it('renders the four groups', () => {
    ['Data', 'Transform', 'Appearance', 'Behavior'].forEach((group) => expect(html).toContain(group));
  });

  it('converts stored radians into authored degrees', () => {
    expect(html).toContain('value="90"');
  });

  it('shows the object type label and default parent', () => {
    expect(html).toContain('Cube Block');
    expect(html).toContain('Workspace');
  });

  it('exposes the material options and behaviour toggles', () => {
    ['Plastic', 'Neon', 'Metal', 'Glass', 'Wood'].forEach((label) => expect(html).toContain(label));
    expect(html).toContain('Anchored');
    expect(html).toContain('CanCollide');
  });

  it('renders the inline Lua editor for the selected part', () => {
    const withScript = renderToString(
      <StudioObjectProperties object={part({ luaScript: 'print("hi")' })} onUpdate={vi.fn()} />
    );
    expect(withScript).toContain('Script');
    expect(withScript).toContain('<textarea');
    expect(withScript).toContain('print(&quot;hi&quot;)');
  });

  it('renders the colour swatch palette with a custom picker', () => {
    expect(html).toContain('aria-label="Custom colour"');
    expect(html.split('aria-label="Use colour').length - 1).toBe(8);
  });
});

describe('Property grid filtering', () => {
  const groups = [
    { title: 'Transform', rows: [{ key: 'p', label: 'Position', control: { type: 'readonly' as const, value: '0,0,0' } }] },
    { title: 'Data', rows: [{ key: 'n', label: 'Name', control: { type: 'readonly' as const, value: 'Block' } }] }
  ];

  it('hides non-matching rows and empty groups', () => {
    const html = renderToString(<PropertyGroupsView groups={groups} filter="posi" />);
    expect(html).toContain('Position');
    expect(html).not.toContain('>Name<');
    expect(html).not.toContain('Data');
  });

  it('keeps every group when the filter is blank', () => {
    const html = renderToString(<PropertyGroupsView groups={groups} filter="   " />);
    expect(html).toContain('Position');
    expect(html).toContain('Name');
  });
});

describe('Studio output console', () => {
  const log = (id: string, level: StudioLogEntry['level'], message: string): StudioLogEntry => ({
    id,
    time: '12:00:00',
    level,
    source: 'Test',
    message
  });
  const logs = [log('1', 'info', 'viewport ready'), log('2', 'warn', 'slow frame'), log('3', 'error', 'lua failed')];

  const render = (filter: 'all' | 'output' | 'errors', collapsed = false) =>
    renderToString(
      <StudioOutputPanel logs={logs} filter={filter} onFilter={vi.fn()} onClear={vi.fn()} collapsed={collapsed} />
    );

  it('shows the empty state when there is nothing to print', () => {
    const html = renderToString(
      <StudioOutputPanel logs={[]} filter="all" onFilter={vi.fn()} onClear={vi.fn()} />
    );
    expect(html).toContain('No messages yet.');
  });

  it('renders every entry under the all filter', () => {
    const html = render('all');
    expect(html).toContain('viewport ready');
    expect(html).toContain('slow frame');
    expect(html).toContain('lua failed');
  });

  it('keeps only errors and warnings under the errors filter', () => {
    const html = render('errors');
    expect(html).toContain('lua failed');
    expect(html).toContain('slow frame');
    expect(html).not.toContain('viewport ready');
  });

  it('drops errors under the output filter', () => {
    const html = render('output');
    expect(html).toContain('viewport ready');
    expect(html).not.toContain('lua failed');
  });

  it('counts errors in the badge', () => {
    expect(plain(render('all'))).toContain('1 errors');
  });

  it('hides the message list when collapsed but keeps the toolbar', () => {
    const html = render('all', true);
    expect(html).toContain('All Messages');
    expect(html).not.toContain('viewport ready');
  });
});

describe('Studio toolbox dock', () => {
  it('renders the six tab labels', () => {
    const html = renderToString(
      <StudioToolboxPanel
        tab="insert"
        onTab={vi.fn()}
        token={null}
        onAddObject={vi.fn()}
        brush={DEFAULT_TERRAIN_BRUSH}
        onBrushChange={vi.fn()}
        isSculpting={false}
        onToggleSculpting={vi.fn()}
        onCreateConstraint={vi.fn()}
        selectionCount={0}
        serverManifest={{
          serverScripts: [],
          remoteEvents: [],
          errors: [],
          addScript: vi.fn(),
          updateScript: vi.fn(),
          removeScript: vi.fn(),
          addEvent: vi.fn(),
          updateEvent: vi.fn(),
          removeEvent: vi.fn(),
          replaceManifest: vi.fn(),
          validate: vi.fn().mockReturnValue([])
        }}
        onApplyMaterial={vi.fn()}
      />
    );
    ['Assets', 'Insert', 'Terrain', 'Material', 'Scripts', 'Import'].forEach((label) => expect(html).toContain(label));
    expect(html).toContain('Toolbox');
    expect(html).toContain('3D Object Palette');
  });
});
