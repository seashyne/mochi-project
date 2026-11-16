// Empirical Verification of Lua 5.4 Syntax Checking and Diagnostic Hints

import { describe, it, expect } from 'vitest';
import {
  checkLuaSyntax,
  checkLuaSyntaxFallback,
  parseLuaCompilerError,
  generateFriendlyHint
} from '../src/components/studio/editor/luaSyntaxChecker';

describe('Lua 5.4 Syntax Checker', () => {
  it('validates clean Lua 5.4 code with zero syntax errors', async () => {
    const validLua = `
      local speed = 100
      local function accelerate(amount)
        return speed + amount
      end
      print(accelerate(25))
    `;
    const err = await checkLuaSyntax(validLua);
    expect(err).toBeNull();
  });

  it('detects missing "end" keyword and provides friendly block closure hint', async () => {
    const missingEnd = `
      local speed = 100
      if speed > 50 then
        print("Speeding!")
    `;
    const err = await checkLuaSyntax(missingEnd);
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/'end' expected/i);
    expect(err?.hint).toContain("missing a closing 'end'");
  });

  it('detects C-style "!=" operator and suggests "~="', async () => {
    const invalidOperator = `
      local a = 10
      local b = 20
      if a != b then
        print("Not equal")
      end
    `;
    const err = await checkLuaSyntax(invalidOperator);
    expect(err).not.toBeNull();
    expect(err?.line).toBe(4);
    expect(err?.hint).toContain("Lua uses '~=' for inequality instead of '!='");
  });

  it('detects unary "!" negation and suggests "not" instead of "~="', async () => {
    const unaryNegation = `
      local isActive = false
      if !isActive then
        print("Inactive")
      end
    `;
    const err = await checkLuaSyntax(unaryNegation);
    expect(err).not.toBeNull();
    expect(err?.hint).toContain("Lua uses 'not' instead of '!'");
    expect(err?.hint).not.toContain("~=");

    // Direct unit assertions for generateFriendlyHint
    const hintUnary = generateFriendlyHint("unexpected symbol near '!'", 'if !flag then', '!');
    expect(hintUnary).toBe("Lua uses 'not' instead of '!'");

    const hintInequality = generateFriendlyHint("unexpected symbol near '!'", 'if a != b then', '!');
    expect(hintInequality).toBe("Lua uses '~=' for inequality instead of '!='");

    // Fallback parser verification
    const fallbackErr = checkLuaSyntaxFallback('local x = !ready');
    expect(fallbackErr).not.toBeNull();
    expect(fallbackErr?.hint).toBe("Lua uses 'not' instead of '!'");
  });

  it('detects C-style "&&" and "||" operators and suggests "and" and "or"', async () => {
    const codeWithAnd = 'local condition = a && b';
    const errAnd = await checkLuaSyntax(codeWithAnd);
    expect(errAnd).not.toBeNull();
    expect(errAnd?.hint).toContain("Lua uses 'and' instead of '&&'");

    const codeWithOr = 'local condition = a || b';
    const errOr = await checkLuaSyntax(codeWithOr);
    expect(errOr).not.toBeNull();
    expect(errOr?.hint).toContain("Lua uses 'or' instead of '||'");
  });

  it('detects C-style "//" comments and suggests "--"', async () => {
    const codeWithSlash = `
      local x = 1
      // Invalid C-style comment
      local y = 2
    `;
    const err = await checkLuaSyntax(codeWithSlash);
    expect(err).not.toBeNull();
    expect(err?.hint).toContain("Lua uses '--' for comments instead of '//'");
  });

  it('detects unfinished strings and suggests closing quote', async () => {
    const unclosedString = `
      local greeting = "Hello world
      print(greeting)
    `;
    const err = await checkLuaSyntax(unclosedString);
    expect(err).not.toBeNull();
    expect(err?.line).toBe(2);
    expect(err?.hint).toContain('String literal is missing a closing quote');
  });

  it('detects missing "then" in if statements', async () => {
    const missingThen = `
      local x = 10
      if x > 5
        print(x)
      end
    `;
    const err = await checkLuaSyntax(missingThen);
    expect(err).not.toBeNull();
    expect(err?.hint).toContain("must be followed by 'then'");
  });

  it('detects missing "do" in while and for loops', async () => {
    const missingDo = `
      for i = 1, 10
        print(i)
      end
    `;
    const err = await checkLuaSyntax(missingDo);
    expect(err).not.toBeNull();
    expect(err?.hint).toContain("must be followed by 'do'");
  });

  it('parses compiler error strings into structured line, token, and message', () => {
    const rawCompilerOutput = `[string "chunk"]:7: 'end' expected (to close 'function' at line 2) near <eof>`;
    const code = `local function test()\n  local a = 1\n  local b = 2\n  return a + b\n`;
    const parsed = parseLuaCompilerError(rawCompilerOutput, code);

    expect(parsed.line).toBe(7);
    expect(parsed.message).toContain("'end' expected");
    expect(parsed.token).toBe('<eof>');
    expect(parsed.hint).toContain("missing a closing 'end'");
  });

  it('operates heuristic fallback validator accurately without wasmoon', () => {
    const fallbackInvalid = `
      local a = 1
      if a != 2 then
        print("Different")
      end
    `;
    const err = checkLuaSyntaxFallback(fallbackInvalid);
    expect(err).not.toBeNull();
    expect(err?.line).toBe(3);
    expect(err?.hint).toContain("Lua uses '~=' for inequality");
  });
});
