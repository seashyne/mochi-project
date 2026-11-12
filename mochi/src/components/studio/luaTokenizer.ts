// Clean-room Lua 5.4 Syntax Tokenizer for Mochi Studio Script Editor
// Permissive license compliant, 0 external dependencies

export type LuaTokenType =
  | 'keyword'
  | 'builtin'
  | 'string'
  | 'comment'
  | 'number'
  | 'operator'
  | 'text';

export interface LuaToken {
  type: LuaTokenType;
  value: string;
}

const LUA_KEYWORDS = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while'
]);

const MOCHI_GLOBALS = new Set([
  'script',
  'parent',
  'Parent',
  'print',
  'warn',
  'task',
  'Vector3',
  'world',
  'players',
  'ui',
  'math',
  'string',
  'table',
  'os',
  'Connect',
  'onTouch',
  'onUpdate',
  'wait'
]);

export function tokenizeLuaLine(line: string): LuaToken[] {
  const tokens: LuaToken[] = [];
  let i = 0;

  while (i < line.length) {
    // Comment
    if (line.slice(i, i + 2) === '--') {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // String literal
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let end = i + 1;
      while (end < line.length && line[end] !== quote) {
        if (line[end] === '\\') end++;
        end++;
      }
      if (end < line.length) end++;
      tokens.push({ type: 'string', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i])) {
      let end = i;
      while (end < line.length && /[\d.]/.test(line[end])) end++;
      tokens.push({ type: 'number', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_]/.test(line[i])) {
      let end = i;
      while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
      const word = line.slice(i, end);
      if (LUA_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (MOCHI_GLOBALS.has(word)) {
        tokens.push({ type: 'builtin', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      i = end;
      continue;
    }

    // Operators and punctuation
    tokens.push({ type: 'operator', value: line[i] });
    i++;
  }

  return tokens;
}
