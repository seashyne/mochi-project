// Minimal Lua 5.x tokenizer for the server scripting sandbox. Supports the
// subset used by Studio server scripts: names, numbers, strings, comments, and
// the standard operator set.

export type TokenType = 'name' | 'number' | 'string' | 'keyword' | 'symbol' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
  'until', 'while'
]);

const THREE_CHAR_SYMBOLS = ['...'];
const TWO_CHAR_SYMBOLS = ['==', '~=', '<=', '>=', '..', '::'];
const ONE_CHAR_SYMBOLS = new Set('+-*/%^#=<>(){}[];:,.');

export class LuaSyntaxError extends Error {
  constructor(message: string, public readonly line: number) {
    super(`line ${line}: ${message}`);
    this.name = 'LuaSyntaxError';
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isNameStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isNamePart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let lineStart = 0;

  const push = (type: TokenType, value: string, at: number) => {
    tokens.push({ type, value, line, column: at - lineStart + 1 });
  };

  while (index < source.length) {
    const ch = source[index];

    if (ch === '\n') {
      index += 1;
      line += 1;
      lineStart = index;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      index += 1;
      continue;
    }

    // Comments: -- line, --[[ block ]]
    if (ch === '-' && source[index + 1] === '-') {
      if (source[index + 2] === '[' && source[index + 3] === '[') {
        const end = source.indexOf(']]', index + 4);
        const stop = end === -1 ? source.length : end + 2;
        for (let i = index; i < stop; i += 1) {
          if (source[i] === '\n') {
            line += 1;
            lineStart = i + 1;
          }
        }
        index = stop;
      } else {
        while (index < source.length && source[index] !== '\n') index += 1;
      }
      continue;
    }

    if (isNameStart(ch)) {
      const start = index;
      while (index < source.length && isNamePart(source[index])) index += 1;
      const word = source.slice(start, index);
      push(KEYWORDS.has(word) ? 'keyword' : 'name', word, start);
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source[index + 1] ?? ''))) {
      const start = index;
      while (index < source.length && isDigit(source[index])) index += 1;
      if (source[index] === '.') {
        index += 1;
        while (index < source.length && isDigit(source[index])) index += 1;
      }
      if (source[index] === 'e' || source[index] === 'E') {
        index += 1;
        if (source[index] === '+' || source[index] === '-') index += 1;
        while (index < source.length && isDigit(source[index])) index += 1;
      }
      push('number', source.slice(start, index), start);
      continue;
    }

    if (ch === '"' || ch === "'") {
      const start = index;
      const quote = ch;
      index += 1;
      let value = '';
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') {
          const next = source[index + 1];
          const escapes: Record<string, string> = {
            n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'"
          };
          value += escapes[next] ?? next;
          index += 2;
          continue;
        }
        if (source[index] === '\n') {
          line += 1;
          lineStart = index + 1;
        }
        value += source[index];
        index += 1;
      }
      if (source[index] !== quote) throw new LuaSyntaxError('unterminated string', line);
      index += 1;
      push('string', value, start);
      continue;
    }

    if (ch === '[' && source[index + 1] === '[') {
      const start = index;
      const end = source.indexOf(']]', index + 2);
      if (end === -1) throw new LuaSyntaxError('unterminated long string', line);
      const value = source.slice(index + 2, end);
      for (let i = index; i < end; i += 1) {
        if (source[i] === '\n') {
          line += 1;
          lineStart = i + 1;
        }
      }
      index = end + 2;
      push('string', value, start);
      continue;
    }

    const three = source.slice(index, index + 3);
    if (THREE_CHAR_SYMBOLS.includes(three)) {
      push('symbol', three, index);
      index += 3;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (TWO_CHAR_SYMBOLS.includes(two)) {
      push('symbol', two, index);
      index += 2;
      continue;
    }
    if (ONE_CHAR_SYMBOLS.has(ch)) {
      push('symbol', ch, index);
      index += 1;
      continue;
    }

    throw new LuaSyntaxError(`unexpected character "${ch}"`, line);
  }

  tokens.push({ type: 'eof', value: '<eof>', line, column: index - lineStart + 1 });
  return tokens;
}
