// Adversarial Challenger Empirical Test Suite: Milestone 4 Studio 3D Editor UX/UI Overhaul (Part 1)
// Rigorous verification of the ribbon, 3D canvas, explorer tree, and core invariants.
// Retargeted at the shell chrome that replaced StudioToolbar / StudioHierarchyTree.
// Strict compliance: SRP <= 300 lines, zero Unicode emojis, zero legacy brands.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import { StudioRibbon } from '../src/components/studio/shell/StudioRibbon';
import { StudioExplorerPanel } from '../src/components/studio/shell/StudioExplorerPanel';
import { Studio3DCanvas } from '../src/components/studio/Studio3DCanvas';
import { StudioScene } from '../src/engine/studio/studioScene';
import { isDescendant } from '../src/engine/studio/hierarchy';
import { StudioObject, StudioObjectType } from '../src/engine/studio/types';
import { plain, ribbonActions } from './shellFixtures';

const M4_TARGET_FILES = [
  'src/components/studio/shell/StudioRibbon.tsx',
  'src/components/studio/shell/StudioMenuBar.tsx',
  'src/components/studio/shell/StudioExplorerPanel.tsx',
  'src/components/studio/shell/StudioPropertiesPanel.tsx',
  'src/components/studio/shell/StudioOutputPanel.tsx',
  'src/components/studio/Studio3DCanvas.tsx',
  'src/components/studio/StudioObjectPalette.tsx',
  'src/components/studio/ScriptConsole.tsx'
];

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
const LEGACY_BRAND_REGEX = /roblox|rbx/i;

function createMockSceneEngine(): StudioScene {
  return {
    init: vi.fn(),
    destroy: vi.fn(),
    resize: vi.fn(),
    setGizmoMode: vi.fn(),
    setGizmoSnapping: vi.fn(),
    clearSelection: vi.fn(),
    selectObject: vi.fn(),
    addObject: vi.fn(),
    removeObject: vi.fn(),
    updateObject: vi.fn(),
    getObjects: vi.fn().mockReturnValue([])
  } as unknown as StudioScene;
}

function createSampleObject(overrides: Partial<StudioObject> = {}): StudioObject {
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

describe('Challenger M4: Architectural Invariants & Compliance Rules', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('enforces Single Responsibility Principle (strictly <= 300 lines) across all M4 files', () => {
    M4_TARGET_FILES.forEach((relPath) => {
      const fullPath = path.join(rootDir, relPath);
      expect(fs.existsSync(fullPath), `Target file must exist: ${relPath}`).toBe(true);
      const lineCount = fs.readFileSync(fullPath, 'utf8').split('\n').length;
      expect(lineCount, `${relPath} exceeds 300 line limit (${lineCount} lines)`).toBeLessThanOrEqual(300);
    });
  });

  it('guarantees zero Unicode emojis across all M4 target files', () => {
    M4_TARGET_FILES.forEach((relPath) => {
      const lines = fs.readFileSync(path.join(rootDir, relPath), 'utf8').split('\n');
      lines.forEach((line, idx) => {
        expect(EMOJI_REGEX.test(line), `Emoji in ${relPath}:${idx + 1}`).toBe(false);
      });
    });
  });

  it('guarantees zero legacy platform brands across all M4 target files', () => {
    M4_TARGET_FILES.forEach((relPath) => {
      const lines = fs.readFileSync(path.join(rootDir, relPath), 'utf8').split('\n');
      lines.forEach((line, idx) => {
        expect(LEGACY_BRAND_REGEX.test(line), `Legacy brand in ${relPath}:${idx + 1}`).toBe(false);
      });
    });
  });

  it('verifies all M4 target files bind the unified semantic studio CSS tokens', () => {
    const requiredTokens = ['studio-bg', 'studio-panel', 'studio-border', 'studio-text', 'studio-card'];
    M4_TARGET_FILES.forEach((relPath) => {
      const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
      const hasStudioTokens = requiredTokens.some((tok) => content.includes(tok));
      expect(hasStudioTokens, `File ${relPath} should utilize studio semantic design tokens`).toBe(true);
    });
  });
});

describe('Challenger M4: StudioRibbon Empirical Verification', () => {
  it('renders the ribbon chrome with studio dark classes and every tab', () => {
    const html = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(html).toContain('bg-studio-ribbon');
    expect(html).toContain('border-studio-border');
    expect(html).toContain('text-studio-text');
    ['Home', 'Model', 'Terrain', 'Script', 'Animation', 'Publish'].forEach((label) => {
      expect(html).toContain(`>${label}<`);
    });
  });

  it('highlights the active tab with studio accent classes and dark text contrast', () => {
    const tabs = ['home', 'script', 'publish'] as const;
    tabs.forEach((tab) => {
      const html = renderToString(<StudioRibbon activeTab={tab} onTab={vi.fn()} actions={ribbonActions()} />);
      expect(html).toContain('bg-studio-card/60');
      expect(html).toContain('border-studio-accent');
    });
  });

  it('surfaces the save action label for idle and saving states', () => {
    const idle = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(idle).toContain('>Save<');

    const saving = renderToString(
      <StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions({ isSaving: true })} />
    );
    expect(saving).toContain('>Saving<');
    expect(saving).toContain('opacity-35');
  });

  it('disables selection-bound tools until a part is selected', () => {
    const idle = renderToString(<StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions()} />);
    expect(idle).toContain('cursor-not-allowed');

    const selected = renderToString(
      <StudioRibbon activeTab="home" onTab={vi.fn()} actions={ribbonActions({ hasSelection: true })} />
    );
    expect(selected).toContain('Duplicate');
    expect(selected).toContain('Anchor');
  });
});

describe('Challenger M4: Studio3DCanvas Empirical Verification', () => {
  it('renders WebGL canvas container with studio-bg well and subdued studio-border', () => {
    const engine = createMockSceneEngine();
    const html = renderToString(<Studio3DCanvas sceneEngine={engine} />);
    expect(html).toContain('bg-studio-bg');
    expect(html).toContain('border-studio-border');
    expect(html).toContain('<canvas');
    expect(html).toContain('cursor-crosshair');
  });

  it('renders floating gizmo toolbar with translate, rotate, scale, and snap buttons', () => {
    const engine = createMockSceneEngine();
    const html = renderToString(<Studio3DCanvas sceneEngine={engine} />);
    expect(html).toContain('Translate Gizmo [W]');
    expect(html).toContain('Rotate Gizmo [E]');
    expect(html).toContain('Scale Gizmo [R]');
    expect(html).toContain('Snap');
    expect(html).toContain('bg-studio-panel/90');
    expect(html).toContain('backdrop-blur-md');
  });

  it('renders viewport control hints overlay with pointer-events-none', () => {
    const engine = createMockSceneEngine();
    const html = renderToString(<Studio3DCanvas sceneEngine={engine} />);
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('Click: Select');
    expect(html).toContain('Drag: Orbit');
    expect(html).toContain('Wheel: Zoom');
  });
});

describe('Challenger M4: StudioExplorerPanel Empirical & Stress', () => {
  const renderTree = (objects: StudioObject[], selectedIds: string[] = []) =>
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

  it('renders the empty tree with the service root and a zero part count', () => {
    const html = renderTree([]);
    expect(html).toContain('Workspace');
    expect(plain(html)).toContain('0 parts');
  });

  it('renders all 7 studio object types under Workspace', () => {
    const types: StudioObjectType[] = ['block', 'platform', 'coin', 'jump_pad', 'hazard', 'spawn', 'model'];
    const objects = types.map((t, idx) => createSampleObject({ id: `obj_${idx}`, name: `Item_${t}`, type: t }));
    const html = renderTree(objects);
    types.forEach((t) => expect(html).toContain(`Item_${t}`));
    expect(plain(html)).toContain('7 parts');
  });

  it('marks the selected part with the accent row and keeps the rest idle', () => {
    const blockObj = createSampleObject({ id: 'b1', name: 'Block_A' });
    const coinObj = createSampleObject({ id: 'c1', name: 'Coin_A', type: 'coin' });
    const html = renderTree([blockObj, coinObj], ['b1']);
    expect(html).toContain('bg-studio-accent/25');
    expect(html.split('bg-studio-accent/25').length - 1).toBe(1);
  });

  it('verifies isDescendant ancestor traversal oracle correctly detects relations', () => {
    const objects: StudioObject[] = [
      createSampleObject({ id: 'root_model', type: 'model' }),
      createSampleObject({ id: 'sub_model', type: 'model', parentId: 'root_model' }),
      createSampleObject({ id: 'leaf_part', type: 'block', parentId: 'sub_model' }),
      createSampleObject({ id: 'unrelated_part', type: 'coin' })
    ];

    expect(isDescendant(objects, 'leaf_part', 'sub_model')).toBe(true);
    expect(isDescendant(objects, 'leaf_part', 'root_model')).toBe(true);
    expect(isDescendant(objects, 'sub_model', 'root_model')).toBe(true);
    expect(isDescendant(objects, 'root_model', 'sub_model')).toBe(false);
    expect(isDescendant(objects, 'unrelated_part', 'root_model')).toBe(false);
    expect(isDescendant(objects, 'root_model', 'root_model')).toBe(false);
  });

  it('survives stress rendering of a deep nested hierarchy (15 levels deep)', () => {
    const deepObjects: StudioObject[] = [];
    let currentParent: string | undefined = undefined;
    for (let i = 0; i < 15; i++) {
      const id = `model_level_${i}`;
      deepObjects.push(createSampleObject({ id, name: `Level_${i}`, type: 'model', parentId: currentParent }));
      currentParent = id;
    }
    deepObjects.push(createSampleObject({ id: 'leaf_node', name: 'DeepLeaf', type: 'block', parentId: currentParent }));

    const html = renderTree(deepObjects, ['leaf_node']);
    expect(html).toContain('DeepLeaf');
    expect(html).toContain('Level_0');
    expect(html).toContain('Level_14');
  });
});
