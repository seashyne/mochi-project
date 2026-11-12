// Statement parser for the server scripting Lua subset. Wires the expression
// parser to block parsing so function literals can contain statements.

import { tokenize } from './luaLexer';
import type { LuaChunk, LuaExpr, LuaIfBranch, LuaStmt } from './luaAst';
import { TokenStream } from './luaTokenStream';
import {
  bindFunctionBodyParser,
  parseExpression,
  parseExpressionList,
  parseParamList,
  parsePrefixExpression
} from './luaExprParser';

function parseBlock(stream: TokenStream, terminators: string[]): LuaStmt[] {
  const body: LuaStmt[] = [];
  while (!stream.atEnd() && !terminators.includes(stream.peek().value)) {
    const statement = parseStatement(stream);
    if (statement) body.push(statement);
  }
  return body;
}

// Function literals are parsed by the expression parser, which needs blocks.
// The bound parser must consume the closing `end` so the caller can continue.
bindFunctionBodyParser((stream) => {
  const body = parseBlock(stream, ['end']);
  stream.expect('end');
  return body;
});

function parseStatement(stream: TokenStream): LuaStmt | null {
  const token = stream.peek();

  if (stream.match(';')) return null;

  if (token.type === 'keyword') {
    switch (token.value) {
      case 'local':
        return parseLocal(stream);
      case 'if':
        return parseIf(stream);
      case 'while':
        return parseWhile(stream);
      case 'repeat':
        return parseRepeat(stream);
      case 'for':
        return parseFor(stream);
      case 'function':
        return parseFunctionDecl(stream);
      case 'return': {
        stream.next();
        const values =
          stream.check('end') ||
          stream.check('else') ||
          stream.check('elseif') ||
          stream.check('until') ||
          stream.atEnd()
            ? []
            : parseExpressionList(stream);
        stream.match(';');
        return { type: 'return', values };
      }
      case 'break':
        stream.next();
        return { type: 'break' };
      case 'do': {
        stream.next();
        const body = parseBlock(stream, ['end']);
        stream.expect('end');
        return { type: 'do', body };
      }
      default:
        break;
    }
  }

  return parseAssignmentOrCall(stream);
}

function parseLocal(stream: TokenStream): LuaStmt {
  stream.expect('local');

  // `local function name(...) ... end` declares before the body so the function
  // can call itself recursively.
  if (stream.check('function')) {
    stream.next();
    const name = stream.expectName();
    const params = parseParamList(stream);
    const body = parseBlock(stream, ['end']);
    stream.expect('end');
    return { type: 'localFunction', name, params, body };
  }

  const names = [stream.expectName()];
  while (stream.match(',')) names.push(stream.expectName());
  const values = stream.match('=') ? parseExpressionList(stream) : [];
  return { type: 'local', names, values };
}

function parseIf(stream: TokenStream): LuaStmt {
  stream.expect('if');
  const branches: LuaIfBranch[] = [];
  const cond = parseExpression(stream);
  stream.expect('then');
  branches.push({ cond, body: parseBlock(stream, ['elseif', 'else', 'end']) });

  while (stream.match('elseif')) {
    const elseifCond = parseExpression(stream);
    stream.expect('then');
    branches.push({ cond: elseifCond, body: parseBlock(stream, ['elseif', 'else', 'end']) });
  }
  if (stream.match('else')) {
    branches.push({ cond: null, body: parseBlock(stream, ['end']) });
  }
  stream.expect('end');
  return { type: 'if', branches };
}

function parseWhile(stream: TokenStream): LuaStmt {
  stream.expect('while');
  const cond = parseExpression(stream);
  stream.expect('do');
  const body = parseBlock(stream, ['end']);
  stream.expect('end');
  return { type: 'while', cond, body };
}

function parseRepeat(stream: TokenStream): LuaStmt {
  stream.expect('repeat');
  const body = parseBlock(stream, ['until']);
  stream.expect('until');
  const cond = parseExpression(stream);
  return { type: 'repeat', body, cond };
}

function parseFor(stream: TokenStream): LuaStmt {
  stream.expect('for');
  const firstName = stream.expectName();

  if (stream.match('=')) {
    const start = parseExpression(stream);
    stream.expect(',');
    const stop = parseExpression(stream);
    const step = stream.match(',') ? parseExpression(stream) : null;
    stream.expect('do');
    const body = parseBlock(stream, ['end']);
    stream.expect('end');
    return { type: 'forNum', name: firstName, start, stop, step, body };
  }

  const names = [firstName];
  while (stream.match(',')) names.push(stream.expectName());
  stream.expect('in');
  const values = parseExpressionList(stream);
  stream.expect('do');
  const body = parseBlock(stream, ['end']);
  stream.expect('end');
  return { type: 'forIn', names, values, body };
}

function parseFunctionDecl(stream: TokenStream): LuaStmt {
  stream.expect('function');
  let target: LuaExpr = { type: 'name', name: stream.expectName() };
  while (stream.match('.')) {
    target = { type: 'index', target, key: { type: 'string', value: stream.expectName() } };
  }
  if (stream.match(':')) {
    const method = stream.expectName();
    const params = parseParamList(stream);
    params.unshift('self');
    const body = parseBlock(stream, ['end']);
    stream.expect('end');
    return {
      type: 'functionDecl',
      target: { type: 'index', target, key: { type: 'string', value: method } },
      params,
      body
    };
  }
  const params = parseParamList(stream);
  const body = parseBlock(stream, ['end']);
  stream.expect('end');
  return { type: 'functionDecl', target, params, body };
}

function parseAssignmentOrCall(stream: TokenStream): LuaStmt {
  const first = parsePrefixExpression(stream);
  if (stream.check('=') || stream.check(',')) {
    const targets: LuaExpr[] = [first];
    while (stream.match(',')) targets.push(parsePrefixExpression(stream));
    stream.expect('=');
    const values = parseExpressionList(stream);
    return { type: 'assign', targets, values };
  }
  if (first.type !== 'call' && first.type !== 'method') {
    throw new Error(`line ${stream.peek().line}: expected an assignment or function call`);
  }
  return { type: 'call', call: first };
}

export function parseLua(source: string): LuaChunk {
  const stream = new TokenStream(tokenize(source));
  const body: LuaStmt[] = [];
  while (!stream.atEnd()) {
    const statement = parseStatement(stream);
    if (statement) body.push(statement);
  }
  return { body };
}
