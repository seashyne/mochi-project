// Shared fixtures for the Studio shell test suites: a complete ribbon action
// contract plus a menu action contract, so each suite only states what it cares
// about. Not a test file itself.

import { vi } from 'vitest';
import type { StudioRibbonActions } from '../src/components/studio/shell/ribbonTypes';
import type { StudioMenuActions } from '../src/components/studio/shell/StudioMenuBar';
import { DEFAULT_TERRAIN_BRUSH } from '../src/engine/studio/advancedTypes';
import type { StudioObject } from '../src/engine/studio/types';

export const ALL_PANELS = { toolbox: true, explorer: true, properties: true, output: true };

/**
 * React SSR inserts `<!-- -->` separators between adjacent text nodes, which
 * splits interpolated strings ("12 parts" renders as "12<!-- --> parts"). Strip
 * them before asserting on visible copy.
 */
export function plain(html: string): string {
  return html.replace(/<!--\s*-->/g, '');
}

export function ribbonActions(overrides: Partial<StudioRibbonActions> = {}): StudioRibbonActions {
  return {
    gizmoMode: 'translate',
    onGizmoMode: vi.fn(),
    snapping: false,
    onToggleSnap: vi.fn(),
    onAddObject: vi.fn(),
    hasSelection: false,
    isAnchored: true,
    onToggleAnchor: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onGroup: vi.fn(),
    onUngroup: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    panels: ALL_PANELS,
    onTogglePanel: vi.fn(),
    onOpenToolboxTab: vi.fn(),
    onPlaytest: vi.fn(),
    onSave: vi.fn(),
    isSaving: false,
    brush: DEFAULT_TERRAIN_BRUSH,
    onBrushChange: vi.fn(),
    isSculpting: false,
    onToggleSculpting: vi.fn(),
    onRunScript: vi.fn(),
    onPublish: vi.fn(),
    ...overrides
  };
}

export function menuActions(overrides: Partial<StudioMenuActions> = {}): StudioMenuActions {
  return {
    canUndo: false,
    canRedo: false,
    hasSelection: false,
    panels: ALL_PANELS,
    ...overrides
  };
}

export function part(overrides: Partial<StudioObject> = {}): StudioObject {
  return {
    id: 'obj_1',
    name: 'Block_1',
    type: 'block',
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    color: '#6366f1',
    material: 'plastic',
    anchored: true,
    canCollide: true,
    ...overrides
  };
}
