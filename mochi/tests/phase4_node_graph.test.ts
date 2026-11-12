import { describe, it, expect } from 'vitest';
import {
  NodeGraph,
  GraphNode,
  NodeKind,
  compileGraphToLua,
  validateGraph,
  escapeLuaString,
  countNodes,
  MAX_GRAPH_STEPS
} from '../src/engine/scripting/nodeGraph';

function graph(nodes: GraphNode[], entryId: string, id = 'g1', name = 'Test'): NodeGraph {
  return { id, name, entryId, nodes };
}

function linear(): NodeGraph {
  return graph(
    [
      { id: 'start', kind: 'event', params: {}, next: 'log' },
      { id: 'log', kind: 'log', params: { message: 'hello' }, next: 'coins' },
      { id: 'coins', kind: 'addCoins', params: { amount: 10 }, next: 'set' },
      { id: 'set', kind: 'setData', params: { key: 'score', value: 42 }, next: 'bc' },
      { id: 'bc', kind: 'broadcast', params: { event: 'ScoreUpdated' } }
    ],
    'start'
  );
}

describe('Phase 4 node graph compiler', () => {
  it('validates a correct linear graph with no errors', () => {
    expect(validateGraph(linear())).toEqual([]);
    expect(countNodes(linear())).toBe(5);
  });

  it('compiles a valid linear graph and contains the expected Lua operations', () => {
    const result = compileGraphToLua(linear());
    expect(result.ok).toBe(true);
    const code = result.code!;
    expect(code).toContain('network.OnServerEvent("g1", function(player, data)');
    expect(code).toContain('print("hello")');
    expect(code).toContain('player.data.increment("coins", 10)');
    expect(code).toContain('player.data.set("score", 42)');
    expect(code).toContain('network.Broadcast("ScoreUpdated", data)');
    expect(code).toContain('while node ~= nil and steps < 256 do');
    expect(code).toContain('steps = steps + 1');
  });

  it('emits a bounded step loop (max 256)', () => {
    const code = compileGraphToLua(linear()).code!;
    expect(code).toContain(String(MAX_GRAPH_STEPS));
    expect(code).toContain('while');
    expect(code).toContain('steps');
  });

  it('emits both branches for a branch graph', () => {
    const g = graph(
      [
        { id: 'start', kind: 'event', params: {}, next: 'check' },
        {
          id: 'check', kind: 'branch', params: { key: 'vip' },
          trueBranch: 'award', falseBranch: 'deny'
        },
        { id: 'award', kind: 'addCoins', params: { amount: 100 }, next: 'done' },
        { id: 'deny', kind: 'log', params: { message: 'no' }, next: 'done' },
        { id: 'done', kind: 'broadcast', params: { event: 'Result' } }
      ],
      'start'
    );
    expect(validateGraph(g)).toEqual([]);
    const code = compileGraphToLua(g).code!;
    expect(code).toContain('if data and data["vip"] then');
    expect(code).toContain('node = "award"');
    expect(code).toContain('node = "deny"');
    expect(code).toContain('else');
  });

  it('rejects a cyclic graph', () => {
    const g = graph(
      [
        { id: 'a', kind: 'event', params: {}, next: 'b' },
        { id: 'b', kind: 'log', params: {}, next: 'a' }
      ],
      'a'
    );
    expect(validateGraph(g).some((e) => /cycle/i.test(e))).toBe(true);
    expect(compileGraphToLua(g).ok).toBe(false);
  });

  it('rejects a dangling target', () => {
    const g = graph([{ id: 'a', kind: 'event', params: {}, next: 'missing' }], 'a');
    expect(validateGraph(g).some((e) => /dangling/i.test(e))).toBe(true);
    const result = compileGraphToLua(g);
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects duplicate ids', () => {
    const g = graph(
      [
        { id: 'a', kind: 'log', params: {}, next: 'b' },
        { id: 'a', kind: 'broadcast', params: {}, next: 'b' },
        { id: 'b', kind: 'event', params: {} }
      ],
      'a'
    );
    expect(validateGraph(g).some((e) => /duplicate/i.test(e))).toBe(true);
    expect(compileGraphToLua(g).ok).toBe(false);
  });

  it('escapes quotes, backslashes and newlines in string literals', () => {
    const input = 'a "q" b \\ c' + String.fromCharCode(10) + 'd';
    const escaped = escapeLuaString(input);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
    expect(escaped).toContain('\\"');   // escaped quote: backslash + quote
    expect(escaped).toContain('\\\\');  // escaped backslash: two backslashes
    expect(escaped).toContain('\\n');   // escaped newline: backslash + n

    const g = graph([{ id: 'a', kind: 'log', params: { message: input } }], 'a');
    const code = compileGraphToLua(g).code!;
    expect(code).toContain('print(' + escaped + ')');
  });

  it('is deterministic (compiling twice yields identical code)', () => {
    const g = linear();
    const a = compileGraphToLua(g);
    const b = compileGraphToLua(g);
    expect(a.code).toBe(b.code);
    expect(validateGraph(g)).toEqual(validateGraph(g));
  });

  it('reports missing entry, unknown kind, missing branch and unreachable nodes', () => {
    const missingEntry = graph([{ id: 'a', kind: 'log', params: {} }], 'nope');
    expect(validateGraph(missingEntry).some((e) => /entry/i.test(e))).toBe(true);

    const unknown = graph(
      [{ id: 'a', kind: 'teleport' as unknown as NodeKind, params: {} }],
      'a'
    );
    expect(validateGraph(unknown).some((e) => /unknown kind/i.test(e))).toBe(true);

    const noBranch = graph([{ id: 'a', kind: 'branch', params: {} }], 'a');
    expect(validateGraph(noBranch).some((e) => /trueBranch/i.test(e))).toBe(true);
    expect(validateGraph(noBranch).some((e) => /falseBranch/i.test(e))).toBe(true);

    const unreachable = graph(
      [
        { id: 'a', kind: 'event', params: {}, next: 'b' },
        { id: 'b', kind: 'broadcast', params: {} },
        { id: 'orphan', kind: 'log', params: {} }
      ],
      'a'
    );
    expect(validateGraph(unreachable).some((e) => /unreachable/i.test(e))).toBe(true);
  });
});
