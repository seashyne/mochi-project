// Studio shell data contracts: the declarative property schemas behind the
// Properties dock, and the bounded output log behind the Output dock.
//
// These are pure, so they are the cheapest place to pin behaviour the shell
// depends on (unit conversion, patch shapes, buffer bounds).

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { buildServicePropertyGroups } from '../src/components/studio/shell/servicePropertySchema';
import { buildObjectPropertyGroups } from '../src/components/studio/shell/StudioObjectProperties';
import { useStudioSystemLog, type StudioLogEntry } from '../src/components/studio/shell/useStudioSystemLog';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import { environmentPatchForClockTime } from '../src/engine/environment/timeOfDay';
import type { StudioObject } from '../src/engine/studio/types';
import { part } from './shellFixtures';

const ctx = (overrides: Partial<Parameters<typeof buildServicePropertyGroups>[1]> = {}) => ({
  environment: STARTER_ENVIRONMENT,
  onEnvironmentChange: vi.fn(),
  objects: [],
  ...overrides
});

const row = (groups: ReturnType<typeof buildServicePropertyGroups>, key: string) => {
  const found = groups.flatMap((group) => group.rows).find((entry) => entry.key === key);
  if (!found) throw new Error(`missing property row: ${key}`);
  return found;
};

describe('Service property schema', () => {
  it('exposes the lighting clock, ambient and sun rows', () => {
    const groups = buildServicePropertyGroups('lighting', ctx());
    expect(groups.map((group) => group.title)).toEqual(['Data', 'Appearance', 'Sun']);
    expect(row(groups, 'clockTime').control.type).toBe('number');
    expect(row(groups, 'ambient').control.type).toBe('slider');
    expect(row(groups, 'sunElevation').control.type).toBe('number');
  });

  it('rewrites the sun arc when the clock changes', () => {
    const change = vi.fn();
    const groups = buildServicePropertyGroups('lighting', ctx({ onEnvironmentChange: change }));
    const control = row(groups, 'clockTime').control;
    if (control.type !== 'number') throw new Error('clockTime must be a number control');
    control.onChange(6);
    expect(change).toHaveBeenCalledWith(environmentPatchForClockTime(6));
    expect(change).toHaveBeenCalledWith({ sunAzimuth: 90, sunElevation: 0 });
  });

  it('reports the time of day as a formatted readout', () => {
    const groups = buildServicePropertyGroups('lighting', ctx());
    const control = row(groups, 'timeLabel').control;
    expect(control.type).toBe('readonly');
    if (control.type === 'readonly') expect(control.value).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('exposes the skybox picker plus the resolved preset details', () => {
    const groups = buildServicePropertyGroups('sky', ctx());
    expect(row(groups, 'skyboxId').control.type).toBe('skybox');
    expect(row(groups, 'skyboxName').control.type).toBe('readonly');
    expect(row(groups, 'sunIntensity').control.type).toBe('readonly');
  });

  it('exposes the atmosphere fog controls', () => {
    const groups = buildServicePropertyGroups('atmosphere', ctx());
    expect(row(groups, 'enabled').control.type).toBe('toggle');
    expect(row(groups, 'density').control.type).toBe('slider');
    expect(row(groups, 'color').control.type).toBe('color');
  });

  it('counts the parts held by Workspace', () => {
    const groups = buildServicePropertyGroups('workspace', ctx({ objects: [part(), part({ id: 'b' })] }));
    const control = row(groups, 'parts').control;
    expect(control.type).toBe('readonly');
    if (control.type === 'readonly') expect(control.value).toBe('2');
  });

  it('defaults the Players count to zero', () => {
    const groups = buildServicePropertyGroups('players', ctx());
    const control = row(groups, 'connected').control;
    if (control.type === 'readonly') expect(control.value).toBe('0');
  });

  it('falls back to information rows for services without a schema', () => {
    const groups = buildServicePropertyGroups('soundservice', ctx());
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Information');
    expect(row(groups, 'className').control.type).toBe('readonly');
  });
});

describe('Part property schema', () => {
  const build = (object: StudioObject, onUpdate = vi.fn()) => ({
    groups: buildObjectPropertyGroups(object, onUpdate),
    onUpdate
  });

  it('groups identity, transform, appearance, behaviour and script', () => {
    const { groups } = build(part());
    expect(groups.map((group) => group.title)).toEqual([
      'Data',
      'Transform',
      'Appearance',
      'Behavior',
      'Script'
    ]);
  });

  it('exposes an inline Lua editor that writes the part script', () => {
    const onUpdate = vi.fn();
    const { groups } = build(part({ luaScript: 'print("hi")' }), onUpdate);
    const control = row(groups, 'luaScript').control;
    if (control.type !== 'code') throw new Error('luaScript must be a code control');
    expect(control.value).toBe('print("hi")');
    control.onChange('script.parent.rotateY(90 * dt)');
    expect(onUpdate).toHaveBeenCalledWith('obj_1', { luaScript: 'script.parent.rotateY(90 * dt)' });
  });

  it('offers a colour swatch palette plus a custom picker', () => {
    const { groups } = build(part({ color: '#10b981' }));
    const control = row(groups, 'color').control;
    if (control.type !== 'swatches') throw new Error('color must be a swatches control');
    expect(control.presets).toHaveLength(8);
    expect(control.presets).toContain('#10b981');
    expect(control.value).toBe('#10b981');
  });

  it('rounds stored radians into authored degrees', () => {
    const { groups } = build(part({ rotation: { x: Math.PI, y: Math.PI / 2, z: -Math.PI / 4 } }));
    const control = row(groups, 'rotation').control;
    if (control.type !== 'vector3') throw new Error('rotation must be a vector3 control');
    expect(control.value.x).toBe(180);
    expect(control.value.y).toBe(90);
    expect(control.value.z).toBe(-45);
  });

  it('writes degrees back as radians', () => {
    const onUpdate = vi.fn();
    const { groups } = build(part(), onUpdate);
    const control = row(groups, 'rotation').control;
    if (control.type !== 'vector3') throw new Error('rotation must be a vector3 control');
    control.onChange({ x: 0, y: 90, z: 0 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdate.mock.calls[0];
    expect(id).toBe('obj_1');
    expect(updates.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });

  it('treats missing behaviour flags as enabled', () => {
    const { groups } = build(part({ anchored: undefined, canCollide: undefined }));
    const anchored = row(groups, 'anchored').control;
    const collide = row(groups, 'canCollide').control;
    if (anchored.type !== 'toggle' || collide.type !== 'toggle') throw new Error('expected toggles');
    expect(anchored.value).toBe(true);
    expect(collide.value).toBe(true);
  });

  it('defaults the parent to Workspace and the material to plastic', () => {
    const { groups } = build(part({ material: undefined }));
    const parent = row(groups, 'parent').control;
    const material = row(groups, 'material').control;
    if (parent.type === 'readonly') expect(parent.value).toBe('Workspace');
    if (material.type === 'select') {
      expect(material.value).toBe('plastic');
      expect(material.options.map((option) => option.value)).toEqual(['plastic', 'neon', 'metal', 'glass', 'wood']);
    }
  });

  it('describes uploaded textures and preset textures differently', () => {
    const uploaded = build(part({ textureAccessId: 'acc_123' })).groups;
    const preset = build(part({ materialTexture: 'concrete' })).groups;
    const none = build(part()).groups;
    const valueOf = (groups: typeof uploaded) => {
      const control = row(groups, 'texture').control;
      return control.type === 'readonly' ? control.value : '';
    };
    expect(valueOf(uploaded)).toBe('Uploaded texture');
    expect(valueOf(preset)).toBe('concrete');
    expect(valueOf(none)).toBe('None');
  });
});

describe('Studio system log', () => {
  const Probe: React.FC<{ seed?: Omit<StudioLogEntry, 'id' | 'time'>[] }> = ({ seed }) => {
    const log = useStudioSystemLog(seed);
    return (
      <div>
        <span>{`count:${log.logs.length}`}</span>
        <span>{`ids:${log.logs.map((entry) => entry.id).join(',')}`}</span>
        <span>{`time:${log.logs[0]?.time ?? 'none'}`}</span>
      </div>
    );
  };

  it('assigns ids and timestamps to seeded entries', () => {
    const html = renderToString(
      <Probe seed={[{ level: 'info', source: 'Studio', message: 'ready' }]} />
    );
    expect(html).toContain('count:1');
    expect(html).toContain('ids:log_1');
    expect(html).toMatch(/time:\d{2}:\d{2}:\d{2}/);
  });

  it('keeps only the newest 200 seeded entries', () => {
    const seed = Array.from({ length: 250 }, (_, index) => ({
      level: 'info' as const,
      source: 'Seed',
      message: `entry ${index}`
    }));
    const html = renderToString(<Probe seed={seed} />);
    expect(html).toContain('count:200');
  });

  it('starts empty when no seed is provided', () => {
    const html = renderToString(<Probe />);
    expect(html).toContain('count:0');
    expect(html).toContain('time:none');
  });
});
