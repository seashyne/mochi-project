// Expression parser for the Lua subset (Pratt precedence climbing).

import { LuaSyntaxError } from './luaLexer';
import type { LuaExpr } from './luaAst';
import { TokenStream } from './luaTokenStream';

const BINARY_PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '~=': 3,
  '<': 3,
  '>': 3,
  '<=': 3,
  '>=': 3,
  '..': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 8
};

const RIGHT_ASSOCIATIVE = new Set(['..', '^']);

export function parseExpressionList(stream: TokenStream): LuaExpr[] {
  const values = [parseExpression(stream)];
  while (stream.match(',')) values.push(parseExpression(stream));
  return values;
}

export function parseExpression(stream: TokenStream, minPrecedence = 1): LuaExpr {
  let left = parseUnary(stream);

  for (;;) {
    const token = stream.peek();
    const precedence = BINARY_PRECEDENCE[token.value];
    if (precedence === undefined || precedence < minPrecedence) break;
    stream.next();
    const nextMin = RIGHT_ASSOCIATIVE.has(token.value) ? precedence : precedence + 1;
    const right = parseExpression(stream, nextMin);
    left = { type: 'binary', op: token.value, left, right };
  }

  return left;
}

function parseUnary(stream: TokenStream): LuaExpr {
  if (stream.check('not') || stream.check('-') || stream.check('#')) {
    const op = stream.next().value;
    return { type: 'unary', op, operand: parseExpression(stream, 7) };
  }
  return parseSimpleExpression(stream);
}

function parseSimpleExpression(stream: TokenStream): LuaExpr {
  const token = stream.peek();

  if (token.type === 'number') {
    stream.next();
    return { type: 'number', value: Number(token.value) };
  }
  if (token.type === 'string') {
    stream.next();
    return { type: 'string', value: token.value };
  }
  if (token.type === 'keyword') {
    if (token.value === 'nil') {
      stream.next();
      return { type: 'nil' };
    }
    if (token.value === 'true' || token.value === 'false') {
      stream.next();
      return { type: 'boolean', value: token.value === 'true' };
    }
    if (token.value === 'function') {
      stream.next();
      const params = parseParamList(stream);
      const body = parseFunctionBody(stream);
      return { type: 'function', params, body };
    }
  }
  if (stream.check('{')) return parseTable(stream);
  return parsePrefixExpression(stream);
}

// Injected by the statement parser to avoid a circular import at module load.
let parseFunctionBody: (stream: TokenStream) => import('./luaAst').LuaStmt[] = () => {
  throw new LuaSyntaxError('function bodies are not available in this context', 0);
};

export function bindFunctionBodyParser(
  parser: (stream: TokenStream) => import('./luaAst').LuaStmt[]
): void {
  parseFunctionBody = parser;
}

export function parseParamList(stream: TokenStream): string[] {
  stream.expect('(');
  const params: string[] = [];
  if (!stream.check(')')) {
    params.push(stream.expectName());
    while (stream.match(',')) params.push(stream.expectName());
  }
  stream.expect(')');
  return params;
}

function parseTable(stream: TokenStream): LuaExpr {
  stream.expect('{');
  const fields: Array<{ key: LuaExpr | null; value: LuaExpr }> = [];

  while (!stream.check('}')) {
    if (stream.check('[')) {
      stream.next();
      const key = parseExpression(stream);
      stream.expect(']');
      stream.expect('=');
      fields.push({ key, value: parseExpression(stream) });
    } else if (stream.peek().type === 'name' && stream.peek(1).value === '=') {
      const key = stream.next().value;
      stream.expect('=');
      fields.push({ key: { type: 'string', value: key }, value: parseExpression(stream) });
    } else {
      fields.push({ key: null, value: parseExpression(stream) });
    }
    if (!stream.match(',') && !stream.match(';')) break;
  }

  stream.expect('}');
  return { type: 'table', fields };
}

export function parsePrefixExpression(stream: TokenStream): LuaExpr {
  let expr: LuaExpr;

  if (stream.peek().type === 'name') {
    expr = { type: 'name', name: stream.next().value };
  } else if (stream.check('(')) {
    stream.next();
    expr = parseExpression(stream);
    stream.expect(')');
  } else {
    throw new LuaSyntaxError(`unexpected token "${stream.peek().value}"`, stream.peek().line);
  }

  for (;;) {
    if (stream.match('.')) {
      expr = { type: 'index', target: expr, key: { type: 'string', value: stream.expectName() } };
    } else if (stream.match('[')) {
      const key = parseExpression(stream);
      stream.expect(']');
      expr = { type: 'index', target: expr, key };
    } else if (stream.match(':')) {
      const method = stream.expectName();
      expr = { type: 'method', target: expr, method, args: parseArguments(stream) };
    } else if (stream.check('(') || stream.check('{') || stream.peek().type === 'string') {
      expr = { type: 'call', callee: expr, args: parseArguments(stream) };
    } else {
      break;
    }
  }

  return expr;
}

function parseArguments(stream: TokenStream): LuaExpr[] {
  if (stream.peek().type === 'string') {
    return [{ type: 'string', value: stream.next().value }];
  }
  if (stream.check('{')) {
    return [parseTable(stream)];
  }
  stream.expect('(');
  if (stream.check(')')) {
    stream.next();
    return [];
  }
  const args = parseExpressionList(stream);
  stream.expect(')');
  return args;
}
