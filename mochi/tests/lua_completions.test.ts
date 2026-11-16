// Empirical Verification of Mochi Engine Autocomplete & IntelliSense

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import {
  mochiLuaCompletionSource,
  MOCHI_GLOBALS,
  MEMBER_COMPLETIONS
} from '../src/components/studio/editor/luaCompletions';

describe('Mochi Engine Lua Autocomplete', () => {
  function getCompletionsAt(code: string, explicit = false) {
    const pos = code.length;
    const state = EditorState.create({ doc: code });
    const context = new CompletionContext(state, pos, explicit);
    return mochiLuaCompletionSource(context);
  }

  it('provides all mandatory Mochi globals in global context', () => {
    const globalLabels = MOCHI_GLOBALS.map((g) => g.label);
    const requiredGlobals = [
      'Instance',
      'Vector3',
      'CFrame',
      'task',
      'ui',
      'players',
      'player',
      'script',
      'world',
      'TweenService',
      'TweenInfo',
      'RunService',
      'Enum'
    ];

    requiredGlobals.forEach((req) => {
      expect(globalLabels).toContain(req);
    });
  });

  it('triggers autocomplete suggestions when typing global identifiers', () => {
    const result = getCompletionsAt('Vec');
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label) || [];
    expect(labels).toContain('Vector3');
  });

  it('triggers member completions for task library', () => {
    const result = getCompletionsAt('task.');
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label) || [];
    expect(labels).toContain('wait');
    expect(labels).toContain('delay');
    expect(labels).toContain('spawn');
  });

  it('triggers member completions for ui library', () => {
    const result = getCompletionsAt('ui.');
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label) || [];
    expect(labels).toContain('showDialogue');
    expect(labels).toContain('hideDialogue');
    expect(labels).toContain('showNotification');
    expect(labels).toContain('setLeaderboard');
  });

  it('triggers member completions for TweenService colon methods', () => {
    const result = getCompletionsAt('TweenService:');
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label) || [];
    expect(labels).toContain('Create');
    expect(labels).toContain('SmoothDamp');
  });

  it('triggers node member properties and signals for script.Parent and node proxies', () => {
    const resultParent = getCompletionsAt('script.Parent.');
    expect(resultParent).not.toBeNull();
    const labelsParent = resultParent?.options.map((o) => o.label) || [];
    expect(labelsParent).toContain('Touched');
    expect(labelsParent).toContain('TouchEnded');
    expect(labelsParent).toContain('Position');
    expect(labelsParent).toContain('Size');
    expect(labelsParent).toContain('Color');
    expect(labelsParent).toContain('Anchored');
    expect(labelsParent).toContain('Destroy');
  });

  it('triggers signal Connect completion for node.Touched: and documents player argument', () => {
    const result = getCompletionsAt('node.Touched:');
    expect(result).not.toBeNull();
    const connectOpt = result?.options.find((o) => o.label === 'Connect');
    expect(connectOpt).toBeDefined();
    expect(connectOpt?.detail).toContain('player');
  });

  it('provides player proxy methods damage, respawn, and addScore', () => {
    const result = getCompletionsAt('player.');
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label) || [];
    expect(labels).toContain('damage');
    expect(labels).toContain('respawn');
    expect(labels).toContain('addScore');
    expect(labels).toContain('health');
  });
});
