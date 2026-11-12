// Studio explorer dock: service tree, nesting, selection and the action bar
// (insert / group / ungroup / duplicate / delete) that replaced the old
// hierarchy tree panel.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioExplorerPanel, isDescendant } from '../src/components/studio/shell/StudioExplorerPanel';
import { StudioExplorerRow, type ExplorerRowActions } from '../src/components/studio/shell/StudioExplorerRow';
import { StudioExplorerContextMenu } from '../src/components/studio/shell/StudioExplorerContextMenu';
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

describe('Explorer row and context menu', () => {
  const actions = (overrides: Partial<ExplorerRowActions> = {}): ExplorerRowActions => ({
    onSelect: vi.fn(),
    onToggleCollapse: vi.fn(),
    onContextMenu: vi.fn(),
    onStartRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    renamingId: null,
    draftName: '',
    onDraftName: vi.fn(),
    onCommitRename: vi.fn(),
    onCancelRename: vi.fn(),
    ...overrides
  });

  it('tags every row with its part id for automation', () => {
    const html = explorer([part({ id: 'obj_x', name: 'Hero' })]);
    expect(html).toContain('data-part-id="obj_x"');
  });

  it('swaps the label for an input while renaming', () => {
    const html = renderToString(
      <StudioExplorerRow
        object={part({ id: 'obj_x', name: 'Hero' })}
        depth={1}
        childCount={0}
        isSelected
        isCollapsed={false}
        actions={actions({ renamingId: 'obj_x', draftName: 'Renamed' })}
      />
    );
    expect(html).toContain('aria-label="Rename Hero"');
    expect(html).toContain('value="Renamed"');
  });

  it('renders the full action list for a part', () => {
    const html = renderToString(
      <StudioExplorerContextMenu
        object={part({ name: 'Hero' })}
        x={10}
        y={20}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onGroup={vi.fn()}
      />
    );
    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="Actions for Hero"');
    ['Rename', 'Duplicate', 'Focus', 'Group into model', 'Delete'].forEach((label) =>
      expect(html).toContain(label)
    );
    expect(html).not.toContain('Ungroup');
  });

  it('offers ungroup instead of group for a model container', () => {
    const html = renderToString(
      <StudioExplorerContextMenu
        object={part({ name: 'Tower', type: 'model' })}
        x={0}
        y={0}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onUngroup={vi.fn()}
      />
    );
    expect(html).toContain('Ungroup');
    expect(html).not.toContain('Group into model');
  });
});

describe('Explorer clipboard and reparent', () => {
  it('offers cut, copy and paste with the paste disabled on an empty clipboard', () => {
    const html = renderToString(
      <StudioExplorerContextMenu
        object={part({ name: 'Hero' })}
        x={0}
        y={0}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onCut={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        canPaste={false}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />
    );
    ['Cut', 'Copy', 'Paste'].forEach((label) => expect(html).toContain(label));
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]*?Paste/);
  });

  it('enables paste once the clipboard holds something', () => {
    const html = renderToString(
      <StudioExplorerContextMenu
        object={part({ name: 'Hero' })}
        x={0}
        y={0}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onPaste={vi.fn()}
        canPaste
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />
    );
    expect(html).not.toContain('disabled=""');
  });

  it('makes rows draggable only when reparenting is wired', () => {
    const withReparent = renderToString(
      <StudioExplorerPanel
        objects={[part({ id: 'a', name: 'A' })]}
        selectedId={null}
        selectedIds={[]}
        selectedService={null}
        onSelectObject={vi.fn()}
        onSelectService={vi.fn()}
        onReparent={vi.fn()}
      />
    );
    expect(withReparent).toContain('draggable="true"');

    expect(explorer()).not.toContain('draggable="true"');
  });

  it('detects descendant cycles before reparenting', () => {
    const objects = [
      part({ id: 'root', type: 'model' }),
      part({ id: 'child', parentId: 'root' }),
      part({ id: 'leaf', parentId: 'child' }),
      part({ id: 'other' })
    ];
    expect(isDescendant(objects, 'leaf', 'root')).toBe(true);
    expect(isDescendant(objects, 'child', 'root')).toBe(true);
    expect(isDescendant(objects, 'root', 'leaf')).toBe(false);
    expect(isDescendant(objects, 'other', 'root')).toBe(false);
  });
});
