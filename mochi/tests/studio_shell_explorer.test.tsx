// Studio explorer dock: service tree, nesting, selection and the action bar
// (insert / group / ungroup / duplicate / delete) that replaced the old
// hierarchy tree panel.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioExplorerPanel } from '../src/components/studio/shell/StudioExplorerPanel';
import { part, plain } from './shellFixtures';

const explorer = (objects = [part()], selectedIds: string[] = []) =>
  renderToString(
    <StudioExplorerPanel
      objects={objects}
      selectedId={selectedIds[0] ?? null}
      selectedIds={selectedIds}
      selectedService={null}
      onSelectObject={vi.fn()}
      onToggleObjectSelect={vi.fn()}
      onSelectService={vi.fn()}
    />
  );

describe('Studio explorer dock', () => {
  it('renders the service tree with Workspace, Lighting and Sky', () => {
    const html = explorer([]);
    expect(html).toContain('Explorer');
    expect(html).toContain('Workspace');
    expect(html).toContain('Lighting');
    expect(html).toContain('Sky');
    expect(plain(html)).toContain('0 parts');
  });

  it('nests parts under Workspace and reports the part count', () => {
    const html = explorer([part({ id: 'a', name: 'StartPad' }), part({ id: 'b', name: 'Coin_1', type: 'coin' })]);
    expect(html).toContain('StartPad');
    expect(html).toContain('Coin_1');
    expect(plain(html)).toContain('2 parts');
  });

  it('renders children of a parent part', () => {
    const html = explorer([
      part({ id: 'model_1', name: 'Tower', type: 'model' }),
      part({ id: 'child_1', name: 'TowerTop', parentId: 'model_1' })
    ]);
    expect(html).toContain('Tower');
    expect(html).toContain('TowerTop');
  });

  it('highlights the selected part with the accent row style', () => {
    const html = explorer([part({ id: 'sel', name: 'Selected_Block' })], ['sel']);
    expect(html).toContain('bg-studio-accent/25');
    expect(html).toContain('border-studio-accent');
  });

  it('exposes the search field', () => {
    expect(explorer()).toContain('placeholder="Search"');
  });

  it('renders the insert, group, duplicate and delete action bar', () => {
    const html = renderToString(
      <StudioExplorerPanel
        objects={[part()]}
        selectedId="obj_1"
        selectedIds={['obj_1']}
        selectedService={null}
        onSelectObject={vi.fn()}
        onSelectService={vi.fn()}
        onAddObject={vi.fn()}
        onGroupSelected={vi.fn()}
        onUngroupSelected={vi.fn()}
        onDuplicateSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
      />
    );
    ['Part', 'Group', 'Duplicate', 'Delete'].forEach((label) => expect(html).toContain(`>${label}<`));
    expect(html).not.toContain('>Ungroup<');
  });

  it('swaps group for ungroup when a model is selected', () => {
    const html = renderToString(
      <StudioExplorerPanel
        objects={[part({ id: 'm1', name: 'Tower', type: 'model' })]}
        selectedId="m1"
        selectedIds={['m1']}
        selectedService={null}
        onSelectObject={vi.fn()}
        onSelectService={vi.fn()}
        onGroupSelected={vi.fn()}
        onUngroupSelected={vi.fn()}
      />
    );
    expect(html).toContain('>Ungroup<');
    expect(html).not.toContain('>Group<');
  });

  it('exposes per-row duplicate and delete affordances', () => {
    const html = renderToString(
      <StudioExplorerPanel
        objects={[part({ name: 'Hero_Block' })]}
        selectedId={null}
        selectedIds={[]}
        selectedService={null}
        onSelectObject={vi.fn()}
        onSelectService={vi.fn()}
        onDuplicateObject={vi.fn()}
        onDeleteObject={vi.fn()}
      />
    );
    expect(html).toContain('aria-label="Duplicate Hero_Block"');
    expect(html).toContain('aria-label="Delete Hero_Block"');
  });

  it('shows the child count badge for a model container', () => {
    const html = explorer([
      part({ id: 'm1', name: 'Tower', type: 'model' }),
      part({ id: 'c1', name: 'TowerTop', parentId: 'm1' }),
      part({ id: 'c2', name: 'TowerBase', parentId: 'm1' })
    ]);
    expect(plain(html)).toContain('2');
  });
});
