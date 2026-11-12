// Core Lua value model for the server scripting sandbox: tables, environments,
// and value conversion. Kept free of interpreter logic so it stays testable.

import type { LuaStmt } from './luaAst';

export type LuaValue =
  | null
  | boolean
  | number
  | string
  | LuaTable
  | LuaFunctionValue
  | NativeFunctionValue;

export interface LuaFunctionValue {
  kind: 'lua';
  params: string[];
  body: LuaStmt[];
  env: Environment;
  name?: string;
}

export interface NativeFunctionValue {
  kind: 'native';
  name: string;
  fn: (args: LuaValue[]) => LuaResult;
}

/** Builds a native function value without importing the sandbox module. */
export function nativeFn(name: string, fn: (args: LuaValue[]) => LuaResult): NativeFunctionValue {
  return { kind: 'native', name, fn };
}

export class LuaRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LuaRuntimeError';
  }
}

/**
 * Transient expression result carrying more than one value (Lua multi-return).
 * Only ever produced by calls; assignment, returns, and arguments unpack it.
 */
export class MultiValue {
  constructor(public readonly values: LuaValue[]) {}
}

export type LuaResult = LuaValue | MultiValue;

/** Collapses a multi-value result to the single value it is used as. */
export function firstValue(value: LuaResult): LuaValue {
  if (value instanceof MultiValue) return value.values[0] ?? null;
  return value;
}

/** Expands a result into the value list Lua would splat. */
export function expandValues(value: LuaResult): LuaValue[] {
  return value instanceof MultiValue ? value.values : [value];
}

/** Expands only the final expression of a list, as Lua does. */
export function expandTail(results: LuaResult[]): LuaValue[] {
  const out: LuaValue[] = [];
  results.forEach((result, index) => {
    if (index === results.length - 1) out.push(...expandValues(result));
    else out.push(firstValue(result));
  });
  return out;
}

export class LuaTable {
  private readonly entries = new Map<string | number, LuaValue>();

  public get(key: string | number): LuaValue {
    const value = this.entries.get(key);
    return value === undefined ? null : value;
  }

  public set(key: string | number, value: LuaValue): void {
    if (value === null) {
      this.entries.delete(key);
      return;
    }
    this.entries.set(key, value);
  }

  public keys(): Array<string | number> {
    return Array.from(this.entries.keys());
  }

  public length(): number {
    let count = 0;
    while (this.entries.has(count + 1)) count += 1;
    return count;
  }

  public toJS(): unknown {
    const numericKeys = this.keys().filter((key): key is number => typeof key === 'number');
    const isArray =
      numericKeys.length === this.entries.size &&
      numericKeys.every((key, index) => key === index + 1);

    if (isArray) {
      return Array.from({ length: this.length() }, (_, i) => toJS(this.get(i + 1)));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of this.entries) {
      result[String(key)] = toJS(value);
    }
    return result;
  }

  public static fromJS(value: unknown): LuaValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      const table = new LuaTable();
      if (Array.isArray(value)) {
        value.forEach((item, index) => table.set(index + 1, LuaTable.fromJS(item)));
      } else {
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
          table.set(key, LuaTable.fromJS(item));
        }
      }
      return table;
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      return value;
    }
    return null;
  }
}

export function toJS(value: LuaValue): unknown {
  if (value instanceof LuaTable) return value.toJS();
  if (value !== null && typeof value === 'object' && 'kind' in value) return null;
  return value;
}

export function display(value: LuaValue): string {
  if (value === null) return 'nil';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return value instanceof LuaTable ? 'table' : 'function';
}

export class Environment {
  private readonly vars = new Map<string, LuaValue>();

  constructor(private readonly parent: Environment | null = null) {}

  public declare(name: string, value: LuaValue): void {
    this.vars.set(name, value);
  }

  public get(name: string): LuaValue {
    if (this.vars.has(name)) return this.vars.get(name) ?? null;
    return this.parent ? this.parent.get(name) : null;
  }

  public assign(name: string, value: LuaValue): void {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new LuaRuntimeError(`attempt to assign undeclared global "${name}"`);
  }

  public has(name: string): boolean {
    return this.vars.has(name) || (this.parent ? this.parent.has(name) : false);
  }
}

export class ReturnSignal {
  constructor(public readonly values: LuaValue[]) {}
}

export class BreakSignal {}
