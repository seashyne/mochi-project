// Expression evaluation for the Lua subset. The interpreter supplies the host
// hooks so statement execution and expression evaluation stay in separate files.
// Call expressions may yield several values (Lua multi-return); every other
// consumer collapses them with firstValue().

import type { LuaExpr } from './luaAst';
import {
  Environment,
  LuaRuntimeError,
  LuaTable,
  display,
  expandTail,
  expandValues,
  firstValue,
  type LuaResult,
  type LuaValue
} from './luaValues';

export interface EvaluatorHost {
  tick(): void;
  invoke(callee: LuaValue, args: LuaValue[], name: string): LuaResult;
  toNumber(value: LuaValue): number;
  truthy(value: LuaValue): boolean;
  toKey(value: LuaValue): string | number;
}

export function evaluate(host: EvaluatorHost, expr: LuaExpr, env: Environment): LuaResult {
  host.tick();
  switch (expr.type) {
    case 'nil':
      return null;
    case 'boolean':
      return expr.value;
    case 'number':
      return expr.value;
    case 'string':
      return expr.value;
    case 'name':
      return env.get(expr.name);
    case 'index': {
      const object = firstValue(evaluate(host, expr.target, env));
      if (!(object instanceof LuaTable)) {
        throw new LuaRuntimeError('attempt to index a non-table value');
      }
      return object.get(host.toKey(firstValue(evaluate(host, expr.key, env))));
    }
    case 'call': {
      const callee = firstValue(evaluate(host, expr.callee, env));
      const args = expandTail(expr.args.map((arg) => evaluate(host, arg, env)));
      const name = expr.callee.type === 'name' ? expr.callee.name : 'function';
      return host.invoke(callee, args, name);
    }
    case 'method': {
      const object = firstValue(evaluate(host, expr.target, env));
      if (!(object instanceof LuaTable)) {
        throw new LuaRuntimeError(`attempt to call method "${expr.method}" on a non-table value`);
      }
      const fn = object.get(expr.method);
      const args = [object, ...expandTail(expr.args.map((arg) => evaluate(host, arg, env)))];
      return host.invoke(fn, args, expr.method);
    }
    case 'binary':
      return evaluateBinary(host, expr.op, expr.left, expr.right, env);
    case 'unary':
      return evaluateUnary(host, expr.op, expr.operand, env);
    case 'table': {
      const table = new LuaTable();
      let arrayIndex = 1;
      expr.fields.forEach((field, index) => {
        const raw = evaluate(host, field.value, env);
        const isTailArray = !field.key && index === expr.fields.length - 1;
        const values = isTailArray ? expandValues(raw) : [firstValue(raw)];
        if (field.key) {
          table.set(host.toKey(firstValue(evaluate(host, field.key, env))), values[0]);
          return;
        }
        for (const value of values) table.set(arrayIndex++, value);
      });
      return table;
    }
    case 'function':
      return { kind: 'lua', params: expr.params, body: expr.body, env };
    default:
      throw new LuaRuntimeError('unsupported expression');
  }
}

function compare(op: string, left: LuaValue, right: LuaValue): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    return op === '<' ? left < right : op === '>' ? left > right : op === '<=' ? left <= right : left >= right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return op === '<' ? left < right : op === '>' ? left > right : op === '<=' ? left <= right : left >= right;
  }
  throw new LuaRuntimeError(`cannot compare values with "${op}"`);
}

export function evaluateBinary(
  host: EvaluatorHost,
  op: string,
  leftExpr: LuaExpr,
  rightExpr: LuaExpr,
  env: Environment
): LuaResult {
  if (op === 'and') {
    const left = firstValue(evaluate(host, leftExpr, env));
    return host.truthy(left) ? evaluate(host, rightExpr, env) : left;
  }
  if (op === 'or') {
    const left = firstValue(evaluate(host, leftExpr, env));
    return host.truthy(left) ? left : evaluate(host, rightExpr, env);
  }

  const left = firstValue(evaluate(host, leftExpr, env));
  const right = firstValue(evaluate(host, rightExpr, env));

  switch (op) {
    case '..':
      return `${display(left)}${display(right)}`;
    case '==':
      return left === right;
    case '~=':
      return left !== right;
    case '<':
    case '>':
    case '<=':
    case '>=':
      return compare(op, left, right);
    default:
      break;
  }

  const a = host.toNumber(left);
  const b = host.toNumber(right);
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
    case '%':
      return a % b;
    case '^':
      return a ** b;
    default:
      throw new LuaRuntimeError(`unsupported operator "${op}"`);
  }
}

export function evaluateUnary(
  host: EvaluatorHost,
  op: string,
  operandExpr: LuaExpr,
  env: Environment
): LuaResult {
  const value = firstValue(evaluate(host, operandExpr, env));
  if (op === 'not') return !host.truthy(value);
  if (op === '-') return -host.toNumber(value);
  if (op === '#') {
    if (typeof value === 'string') return value.length;
    if (value instanceof LuaTable) return value.length();
    throw new LuaRuntimeError('attempt to take the length of a non-table value');
  }
  throw new LuaRuntimeError(`unsupported unary operator "${op}"`);
}
