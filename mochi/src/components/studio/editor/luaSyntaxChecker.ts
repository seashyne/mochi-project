// Lua 5.4 syntax validation using wasmoon load() compilation and heuristic fallback

import { LuaFactory, LuaEngine as WasmoonEngine } from 'wasmoon';

export interface LuaSyntaxError {
  line: number;
  column?: number;
  message: string;
  hint?: string;
  token?: string;
}

let wasmoonEnginePromise: Promise<WasmoonEngine> | null = null;

async function getWasmoonEngine(): Promise<WasmoonEngine> {
  if (!wasmoonEnginePromise) {
    wasmoonEnginePromise = (async () => {
      const factory = new LuaFactory();
      return factory.createEngine();
    })();
  }
  return wasmoonEnginePromise;
}

export function parseLuaCompilerError(errStr: string, code: string): LuaSyntaxError {
  const match = errStr.match(/(?:\[string ".*?"\]|chunk|line)?:?(\d+):\s*(.*)/i);
  const line = match ? parseInt(match[1], 10) : 1;
  const rawMsg = match ? match[2].trim() : errStr.trim();

  let token: string | undefined;
  const tokenMatch = rawMsg.match(/near\s+(?:'([^']+)'|(<[^>]+>))/i);
  if (tokenMatch) {
    token = tokenMatch[1] || tokenMatch[2];
  }

  const lines = code.split('\n');
  const errorLineContent = lines[line - 1] || '';
  const hint = generateFriendlyHint(rawMsg, errorLineContent, token);

  let column: number | undefined;
  if (token && token !== '<eof>' && token !== 'eof') {
    const idx = errorLineContent.indexOf(token);
    if (idx !== -1) {
      column = idx + 1;
    }
  }

  return {
    line,
    column,
    message: rawMsg,
    hint,
    token
  };
}

export function generateFriendlyHint(
  message: string,
  lineContent: string,
  token?: string
): string | undefined {
  if (lineContent.includes('!=')) {
    return "Lua uses '~=' for inequality instead of '!='";
  }
  if (lineContent.includes('&&')) {
    return "Lua uses 'and' instead of '&&'";
  }
  if (lineContent.includes('||')) {
    return "Lua uses 'or' instead of '||'";
  }
  if (token === '!' || /!\s*[a-zA-Z0-9_(]/.test(lineContent)) {
    return "Lua uses 'not' instead of '!'";
  }
  if (lineContent.includes('//')) {
    return "Lua uses '--' for comments instead of '//'";
  }
  if (message.includes("'end' expected")) {
    return "A block (such as 'function', 'if', 'for', or 'while') is missing a closing 'end'";
  }
  if (message.includes("'then' expected")) {
    return "Condition in 'if' or 'elseif' statement must be followed by 'then'";
  }
  if (message.includes("'do' expected")) {
    return "Loop header in 'for' or 'while' statement must be followed by 'do'";
  }
  if (message.includes('unfinished string')) {
    return 'String literal is missing a closing quote';
  }
  if (message.includes("'=' expected near '=='")) {
    return "Variable assignment expects a single '=' rather than '=='";
  }
  return undefined;
}

export function checkLuaSyntaxFallback(code: string): LuaSyntaxError | null {
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const commentIdx = rawLine.indexOf('--');
    const line = commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine;

    if (line.includes('!=')) {
      return {
        line: i + 1,
        column: line.indexOf('!=') + 1,
        message: "unexpected symbol near '!'",
        hint: "Lua uses '~=' for inequality instead of '!='",
        token: '!'
      };
    }
    if (/!\s*[a-zA-Z0-9_(]/.test(line)) {
      return {
        line: i + 1,
        column: line.indexOf('!') + 1,
        message: "unexpected symbol near '!'",
        hint: "Lua uses 'not' instead of '!'",
        token: '!'
      };
    }
    if (line.includes('&&')) {
      return {
        line: i + 1,
        column: line.indexOf('&&') + 1,
        message: "unexpected symbol near '&'",
        hint: "Lua uses 'and' instead of '&&'",
        token: '&'
      };
    }
    if (line.includes('||')) {
      return {
        line: i + 1,
        column: line.indexOf('||') + 1,
        message: "unexpected symbol near '|'",
        hint: "Lua uses 'or' instead of '||'",
        token: '|'
      };
    }
    if (line.includes('//')) {
      return {
        line: i + 1,
        column: line.indexOf('//') + 1,
        message: "unexpected symbol near '/'",
        hint: "Lua uses '--' for comments instead of '//'",
        token: '/'
      };
    }
  }

  let blockDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const commentIdx = rawLine.indexOf('--');
    const line = commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine;
    const words = line.match(/\b(function|if|for|while|repeat|end|until)\b/g) || [];

    for (const w of words) {
      if (['function', 'if', 'for', 'while', 'repeat'].includes(w)) {
        blockDepth++;
      } else if (w === 'end' || w === 'until') {
        blockDepth--;
        if (blockDepth < 0) {
          return {
            line: i + 1,
            message: "unexpected 'end'",
            hint: "Found 'end' without a matching block opener",
            token: 'end'
          };
        }
      }
    }
  }

  if (blockDepth > 0) {
    return {
      line: lines.length,
      message: "'end' expected near <eof>",
      hint: "A block (such as 'function', 'if', 'for', or 'while') is missing a closing 'end'",
      token: '<eof>'
    };
  }

  return null;
}

export async function checkLuaSyntax(code: string): Promise<LuaSyntaxError | null> {
  if (!code || !code.trim()) {
    return null;
  }

  try {
    const engine = await getWasmoonEngine();
    engine.global.set('__mochiCodeToCheck', code);
    const err = engine.doStringSync(
      'local fn, err = load(__mochiCodeToCheck, "chunk", "t"); return err'
    );
    if (typeof err === 'string' && err.trim().length > 0) {
      return parseLuaCompilerError(err, code);
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('chunk') || msg.includes('line')) {
      return parseLuaCompilerError(msg, code);
    }
    return checkLuaSyntaxFallback(code);
  }
}
