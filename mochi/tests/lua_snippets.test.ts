// Empirical Verification of Built-in Mochi Game Mechanic Snippets

import { describe, it, expect } from 'vitest';
import { BUILTIN_SNIPPETS, getSnippetCompletions } from '../src/components/studio/editor/luaSnippets';
import { checkLuaSyntax } from '../src/components/studio/editor/luaSyntaxChecker';

describe('Built-in Game Mechanic Snippets', () => {
  it('defines all 4 required game mechanic snippets', () => {
    const ids = BUILTIN_SNIPPETS.map((s) => s.id);
    expect(ids).toContain('hazard_block');
    expect(ids).toContain('coin_collectible');
    expect(ids).toContain('dialogue_npc');
    expect(ids).toContain('door_tween');
  });

  it('compiles Hazard Block snippet with zero Lua 5.4 syntax errors', async () => {
    const snippet = BUILTIN_SNIPPETS.find((s) => s.id === 'hazard_block');
    expect(snippet).toBeDefined();
    const err = await checkLuaSyntax(snippet!.rawCode);
    expect(err).toBeNull();
  });

  it('compiles Coin Collectible snippet with zero Lua 5.4 syntax errors', async () => {
    const snippet = BUILTIN_SNIPPETS.find((s) => s.id === 'coin_collectible');
    expect(snippet).toBeDefined();
    const err = await checkLuaSyntax(snippet!.rawCode);
    expect(err).toBeNull();
  });

  it('compiles Dialogue NPC Trigger snippet with zero Lua 5.4 syntax errors', async () => {
    const snippet = BUILTIN_SNIPPETS.find((s) => s.id === 'dialogue_npc');
    expect(snippet).toBeDefined();
    const err = await checkLuaSyntax(snippet!.rawCode);
    expect(err).toBeNull();
  });

  it('compiles Door Tween snippet with zero Lua 5.4 syntax errors', async () => {
    const snippet = BUILTIN_SNIPPETS.find((s) => s.id === 'door_tween');
    expect(snippet).toBeDefined();
    const err = await checkLuaSyntax(snippet!.rawCode);
    expect(err).toBeNull();

    // Verifies component addition to avoid js_proxy binary arithmetic crashes
    expect(snippet!.rawCode).toContain('local openPos = Vector3.new(closedPos.x, closedPos.y + 5, closedPos.z)');
    expect(snippet!.rawCode).not.toContain('closedPos + Vector3.new');
    expect(snippet!.template).toContain('local openPos = Vector3.new(closedPos.x, closedPos.y + ${1:5}, closedPos.z)');
    expect(snippet!.template).not.toContain('closedPos + Vector3.new');
  });

  it('generates CodeMirror snippet completions with tabstops and metadata', () => {
    const completions = getSnippetCompletions();
    expect(completions.length).toBe(4);
    completions.forEach((comp) => {
      expect(comp.type).toBe('snippet');
      expect(comp.boost).toBe(15);
      expect(comp.detail).toBeDefined();
      expect(comp.info).toBeDefined();
    });
  });
});
