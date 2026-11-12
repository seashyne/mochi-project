// Tier 5 adversarial tests: the server Lua interpreter. Locks down language
// semantics, sandbox boundaries, and resource limits so a script cannot hang or
// escape the Durable Object.

import { describe, it, expect } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';

function harness(options: { maxSteps?: number; maxDepth?: number } = {}) {
  const fired: Array<{ id: string; event: string; data: unknown }> = [];
  const state = new Map<string, unknown>();

  const runtime = new ServerLuaRuntime(
    {
      onFireClient: (id, event, data) => fired.push({ id, event, data }),
      onStateReplicate: (key, value) => state.set(key, value)
    },
    options
  );

  return { runtime, fired, state };
}

async function runScript(script: string, options: { maxSteps?: number; maxDepth?: number } = {}) {
  const h = harness(options);
  const result = await h.runtime.loadScript(script);
  return { ...h, result };
}

describe('Tier 5: Server Lua Interpreter Hardening', () => {
  describe('Language semantics', () => {
    it('evaluates arithmetic with correct precedence', async () => {
      const { runtime, state, result } = await runScript(`
        state.set("a", 2 + 3 * 4)
        state.set("b", (2 + 3) * 4)
        state.set("c", 2 ^ 3 ^ 2)
        state.set("d", 10 % 3)
        state.set("e", -5 + 1)
      `);
      expect(result.success).toBe(true);
      expect(runtime.getState('a')).toBe(14);
      expect(runtime.getState('b')).toBe(20);
      expect(runtime.getState('c')).toBe(512);
      expect(runtime.getState('d')).toBe(1);
      expect(runtime.getState('e')).toBe(-4);
      expect(state.size).toBe(5);
    });

    it('concatenates strings and reports length', async () => {
      const { runtime } = await runScript(`
        local name = "Mochi"
        state.set("greeting", "Hello, " .. name .. "!")
        state.set("len", #name)
        state.set("num", 3 .. 4)
      `);
      expect(runtime.getState('greeting')).toBe('Hello, Mochi!');
      expect(runtime.getState('len')).toBe(5);
      expect(runtime.getState('num')).toBe('34');
    });

    it('branches on truthiness with elseif chains', async () => {
      const { runtime } = await runScript(`
        local function grade(score)
          if score >= 90 then
            return "A"
          elseif score >= 70 then
            return "B"
          else
            return "C"
          end
        end
        state.set("g1", grade(95))
        state.set("g2", grade(75))
        state.set("g3", grade(10))
      `);
      expect(runtime.getState('g1')).toBe('A');
      expect(runtime.getState('g2')).toBe('B');
      expect(runtime.getState('g3')).toBe('C');
    });

    it('short-circuits and/or and returns operand values', async () => {
      const { runtime } = await runScript(`
        state.set("a", false or "fallback")
        state.set("b", nil and "never")
        state.set("c", 0 and "zero-is-truthy")
      `);
      expect(runtime.getState('a')).toBe('fallback');
      expect(runtime.getState('b')).toBeNull();
      expect(runtime.getState('c')).toBe('zero-is-truthy');
    });

    it('supports while loops with break', async () => {
      const { runtime } = await runScript(`
        local i = 0
        while true do
          i = i + 1
          if i >= 5 then
            break
          end
        end
        state.set("i", i)
      `);
      expect(runtime.getState('i')).toBe(5);
    });

    it('supports numeric for with step', async () => {
      const { runtime } = await runScript(`
        local total = 0
        for i = 10, 1, -3 do
          total = total + i
        end
        state.set("total", total)
      `);
      expect(runtime.getState('total')).toBe(10 + 7 + 4 + 1);
    });

    it('iterates tables with a generic for', async () => {
      const { runtime } = await runScript(`
        local scores = { alpha = 3, beta = 4 }
        local total = 0
        for key, value in scores do
          total = total + value
        end
        state.set("total", total)
      `);
      expect(runtime.getState('total')).toBe(7);
    });

    it('supports recursion and early returns', async () => {
      const { runtime } = await runScript(`
        local function factorial(n)
          if n <= 1 then
            return 1
          end
          return n * factorial(n - 1)
        end
        state.set("fact", factorial(5))
      `);
      expect(runtime.getState('fact')).toBe(120);
    });

    it('builds nested tables and converts them to JSON payloads', async () => {
      const { runtime, fired } = await runScript(`
        network.OnServerEvent("Sync", function(player, data)
          local payload = {
            player = player.username,
            nested = { level = 2 },
            list = { 10, 20, 30 }
          }
          network.FireClient(player.id, "Synced", payload)
        end)
      `);
      runtime.addPlayer({ id: 'p1', username: 'Nova' });
      expect(runtime.dispatchServerEvent('p1', 'Sync', {})).toBe(true);
      expect(fired[0].data).toEqual({
        player: 'Nova',
        nested: { level: 2 },
        list: [10, 20, 30]
      });
    });

    it('exposes math and string libraries', async () => {
      const { runtime } = await runScript(`
        state.set("floor", math.floor(3.9))
        state.set("max", math.max(2, 9, 4))
        state.set("upper", string.upper("mochi"))
        state.set("sub", string.sub("abcdef", 2, 4))
      `);
      expect(runtime.getState('floor')).toBe(3);
      expect(runtime.getState('max')).toBe(9);
      expect(runtime.getState('upper')).toBe('MOCHI');
      expect(runtime.getState('sub')).toBe('bcd');
    });

    it('reads replicated state back through state.get', async () => {
      const { runtime } = await runScript(`
        state.set("counter", 7)
        state.set("echo", state.get("counter"))
      `);
      expect(runtime.getState('echo')).toBe(7);
    });

    it('formats print arguments with tabs', async () => {
      const { runtime } = await runScript('print("a", 1, true)');
      expect(runtime.getLogs().some((l) => l.message === 'a\t1\ttrue')).toBe(true);
    });
  });

  describe('Sandbox boundaries', () => {
    it('does not expose host or Node globals', async () => {
      const { runtime } = await runScript(`
        state.set("require", require)
        state.set("os", os)
        state.set("io", io)
        state.set("process", process)
      `);
      expect(runtime.getState('require')).toBeNull();
      expect(runtime.getState('os')).toBeNull();
      expect(runtime.getState('io')).toBeNull();
      expect(runtime.getState('process')).toBeNull();
    });

    it('fails on calling a non-function', async () => {
      const { result } = await runScript('local x = 5\nx()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a function');
    });

    it('fails on arithmetic over non-numeric strings', async () => {
      const { result } = await runScript('local x = "abc" + 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('arithmetic');
    });

    it('fails on indexing nil', async () => {
      const { result } = await runScript('local t = nil\nstate.set("x", t.field)');
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-table');
    });
  });

  describe('Resource limits', () => {
    it('aborts runaway loops at the step limit', async () => {
      const { result } = await runScript('while true do end', { maxSteps: 5000 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('step limit');
    });

    it('aborts unbounded recursion at the depth limit', async () => {
      const { result } = await runScript('local function f() return f() end\nf()', {
        maxDepth: 24
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('depth limit');
    });

    it('rejects malformed syntax with a line number', async () => {
      const { result } = await runScript('if true then\nprint("x")');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/line \d+/);
    });
  });
});
