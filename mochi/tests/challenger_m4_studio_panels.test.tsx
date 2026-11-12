// Adversarial Challenger Empirical Test Suite: Milestone 4 Studio 3D Editor UX/UI Overhaul (Part 2)
// Rigorous verification of the part property grid, the properties dock, the object palette
// and the script console. Retargeted at StudioObjectProperties / StudioPropertiesPanel.
// Strict compliance: SRP <= 300 lines, zero Unicode emojis, zero legacy brands.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioObjectProperties } from '../src/components/studio/shell/StudioObjectProperties';
import { StudioPropertiesPanel } from '../src/components/studio/shell/StudioPropertiesPanel';
import { StudioObjectPalette } from '../src/components/studio/StudioObjectPalette';
import { ScriptConsole } from '../src/components/studio/ScriptConsole';
import { StudioObject, StudioObjectType, OBJECT_TYPE_DEFAULTS } from '../src/engine/studio/types';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import { LuaLogEntry } from '../src/engine/lua/types';

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

describe('Challenger M4: StudioObjectProperties Empirical Verification', () => {
  it('renders complete transform, appearance, and behaviour fields', () => {
    const obj = createSampleObject({
      name: 'InteractiveCoin',
      type: 'coin',
      position: { x: 12.5, y: -4, z: 0.5 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 1, y: 1.5, z: 1 },
      material: 'neon',
      anchored: true,
      canCollide: false
    });

    const html = renderToString(<StudioObjectProperties object={obj} onUpdate={vi.fn()} />);
    ['Data', 'Transform', 'Appearance', 'Behavior'].forEach((group) => expect(html).toContain(group));
    expect(html).toContain('value="InteractiveCoin"');
    expect(html).toContain('value="12.5"');
    expect(html).toContain('value="-4"');
    expect(html).toContain('value="0.5"');
    expect(html).toContain('value="90"');
    expect(html).toContain('value="1.5"');
    expect(html).toContain('Plastic');
    expect(html).toContain('Neon');
    expect(html).toContain('Metal');
    expect(html).toContain('Glass');
    expect(html).toContain('Wood');
    expect(html).toContain('Anchored');
    expect(html).toContain('CanCollide');
  });

  it('correctly handles boundary conditions: rotation degree conversion with zero and negative angles', () => {
    const objNegativeRot = createSampleObject({
      rotation: { x: -Math.PI, y: -Math.PI / 4, z: 2 * Math.PI }
    });

    const html = renderToString(<StudioObjectProperties object={objNegativeRot} onUpdate={vi.fn()} />);
    expect(html).toContain('value="-180"');
    expect(html).toContain('value="-45"');
    expect(html).toContain('value="360"');
  });

  it('supports unanchored and non-colliding physics states correctly', () => {
    const objPhysicsOff = createSampleObject({ anchored: false, canCollide: false });
    const html = renderToString(<StudioObjectProperties object={objPhysicsOff} onUpdate={vi.fn()} />);
    expect(html.split('aria-checked="false"').length - 1).toBe(2);
    expect(html).not.toContain('aria-checked="true"');
  });

  it('shows the type label and default parent for a freshly inserted part', () => {
    const html = renderToString(<StudioObjectProperties object={createSampleObject()} onUpdate={vi.fn()} />);
    expect(html).toContain(OBJECT_TYPE_DEFAULTS.block.label);
    expect(html).toContain('Workspace');
    expect(html).toContain('None');
  });
});

describe('Challenger M4: StudioPropertiesPanel Dock Verification', () => {
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

  it('renders a clean placeholder prompt when nothing is selected', () => {
    const html = render();
    expect(html).toContain('No Selection');
    expect(html).toContain('Nothing is selected');
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('border-studio-border');
  });

  it('swaps to the service schema when a service is selected', () => {
    const html = render({ selectedService: 'lighting', onEnvironmentReset: vi.fn() });
    expect(html).toContain('ClockTime');
    expect(html).toContain('SunElevation');
    expect(html).toContain('Reset to starter environment');
  });

  it('swaps to the part schema when a part is selected', () => {
    const html = render({ selectedObject: createSampleObject({ name: 'Hero_Block' }), selectedCount: 1 });
    expect(html).toContain('Hero_Block');
    expect(html).toContain('Position');
  });

  it('warns when a multi-selection is being edited through one part', () => {
    const html = render({ selectedObject: createSampleObject({ name: 'Primary' }), selectedCount: 4 });
    expect(html.replace(/<!--\s*-->/g, '')).toContain('4 parts selected');
  });
});

describe('Challenger M4: StudioObjectPalette Empirical Verification', () => {
  it('renders all 12 palette items with studio-panel and studio-card tokens', () => {
    const html = renderToString(<StudioObjectPalette onAddObject={vi.fn()} />);
    expect(html).toContain('3D Object Palette');
    expect(html).toContain('12 Components');
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('bg-studio-card');
    expect(html).toContain('border-studio-border');
    expect(html).toContain('Solid terrain block');
    expect(html).toContain('Floating kinematic ledge');
    expect(html).toContain('Rotating score pickup');
    expect(html).toContain('Vertical velocity booster');
    expect(html).toContain('Lava respawn trigger');
    expect(html).toContain('Initial player origin');
    expect(html).toContain('Sculptable voxel terrain');
    expect(html).toContain('Joint between two parts');
    expect(html).toContain('Point particle emitter');
  });

  it('matches all 6 palette labels with OBJECT_TYPE_DEFAULTS configuration', () => {
    const html = renderToString(<StudioObjectPalette onAddObject={vi.fn()} />);
    const types: StudioObjectType[] = ['block', 'platform', 'coin', 'jump_pad', 'hazard', 'spawn'];
    types.forEach((t) => {
      const label = OBJECT_TYPE_DEFAULTS[t].label;
      expect(html).toContain(label);
    });
  });
});

describe('Challenger M4: ScriptConsole Empirical Verification', () => {
  it('renders console header, studio-panel container, and empty log prompt', () => {
    const html = renderToString(<ScriptConsole title="Lua Runner" logs={[]} onClear={vi.fn()} />);
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('border-studio-border');
    expect(html).toContain('Lua Runner');
    expect(html).toContain('No console output yet');
  });

  it('renders script editor gutter, line numbers, and syntax overlay when code is provided', () => {
    const sampleLua = `local speed = 50\nprint("Speed is: " .. speed)\nif speed > 20 then\n  print("Fast!")\nend`;
    const html = renderToString(
      <ScriptConsole code={sampleLua} logs={[]} onCodeChange={vi.fn()} onClear={vi.fn()} onRunTest={vi.fn()} />
    );
    expect(html).toContain('Run &amp; Test Script');
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('>3<');
    expect(html).toContain('>4<');
    expect(html).toContain('>5<');
    expect(html).toContain('local');
    expect(html).toContain('print');
    expect(html).toContain('Speed is: ');
  });

  it('identifies runtime error line number and highlights error banner', () => {
    const sampleLua = `local a = 10\nlocal b = nil\nprint(b.property)`;
    const html = renderToString(
      <ScriptConsole code={sampleLua} logs={[]} hasError={true} errorMessage="Runtime error at line 3: attempt to index nil" onCodeChange={vi.fn()} onClear={vi.fn()} />
    );
    expect(html).toContain('Runtime Error on Line 3:');
    expect(html).toContain('attempt to index nil');
    expect(html).toContain('Error');
  });

  it('renders diverse log levels (info, warn, error) with timestamps and status badges', () => {
    const logs: LuaLogEntry[] = [
      { level: 'info', message: 'Script initialized successfully', timestamp: 1700000000000 },
      { level: 'warn', message: 'Physics step took longer than 16ms', timestamp: 1700000001000 },
      { level: 'error', message: 'Global variable collision detected', timestamp: 1700000002000 }
    ];

    const html = renderToString(<ScriptConsole logs={logs} executionTimeMs={4.2} onClear={vi.fn()} />);
    expect(html).toMatch(/4\.2(<!-- -->)?ms/);
    expect(html).toContain('INFO');
    expect(html).toContain('WARN');
    expect(html).toContain('ERR');
    expect(html).toContain('Script initialized successfully');
    expect(html).toContain('Physics step took longer than 16ms');
    expect(html).toContain('Global variable collision detected');
  });
});
