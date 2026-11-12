// Lua multi-return semantics: functions may return several values, only the
// tail expression of a list expands, and everything else takes the first value.

import { describe, expect, it } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';

async function run(script: string): Promise<string[]> {
  const runtime = new ServerLuaRuntime();
  const result = await runtime.loadScript(script);
  if (!result.success) throw new Error(result.error);
  return runtime.getLogs().map((entry) => entry.message);
}

describe('multi-return values', () => {
  it('assigns every returned value to the matching name', async () => {
    const logs = await run(`
      local function pair() return 1, 2 end
      local a, b = pair()
      print(a, b)
    `);
    expect(logs).toEqual(['1\t2']);
  });

  it('keeps only the first value in a single assignment', async () => {
    const logs = await run(`
      local function pair() return 1, 2 end
      local only = pair()
      print(only)
    `);
    expect(logs).toEqual(['1']);
  });

  it('expands only the final expression of a list', async () => {
    const logs = await run(`
      local function pair() return 1, 2 end
      local x, y = pair(), 9
      print(x, y)
    `);
    expect(logs).toEqual(['1\t9']);
  });

  it('expands the tail argument of a call', async () => {
    const logs = await run(`
      local function pair() return 1, 2 end
      print("values", pair())
    `);
    expect(logs).toEqual(['values\t1\t2']);
  });

  it('uses the first value in arithmetic', async () => {
    const logs = await run(`
      local function pair() return 4, 99 end
      print(pair() + 1)
    `);
    expect(logs).toEqual(['5']);
  });

  it('expands a tail call inside a table constructor', async () => {
    const logs = await run(`
      local function pair() return "a", "b" end
      local t = { pair() }
      print(#t, t[1], t[2])
    `);
    expect(logs).toEqual(['2\ta\tb']);
  });

  it('passes values through nested returns', async () => {
    const logs = await run(`
      local function inner() return 1, 2 end
      local function outer() return inner() end
      local a, b = outer()
      print(a, b)
    `);
    expect(logs).toEqual(['1\t2']);
  });
});

describe('pcall with multi-return', () => {
  it('returns false plus the error message', async () => {
    const logs = await run(`
      local ok, err = pcall(function() error("boom") end)
      print(ok, err)
    `);
    expect(logs).toEqual(['false\tboom']);
  });

  it('returns true plus the function results', async () => {
    const logs = await run(`
      local ok, value = pcall(function() return 42 end)
      print(ok, value)
    `);
    expect(logs).toEqual(['true\t42']);
  });

  it('returns true plus every returned value', async () => {
    const logs = await run(`
      local ok, a, b = pcall(function() return "x", "y" end)
      print(ok, a, b)
    `);
    expect(logs).toEqual(['true\tx\ty']);
  });

  it('still exposes the message through lastError', async () => {
    const logs = await run(`
      pcall(function() error("nope") end)
      print(lastError())
    `);
    expect(logs).toEqual(['nope']);
  });

  it('does not swallow interpreter step limits', async () => {
    const runtime = new ServerLuaRuntime();
    const result = await runtime.loadScript(`
      while true do end
    `);
    expect(result.success).toBe(false);
    expect(result.error).toContain('step limit');
  });
});
