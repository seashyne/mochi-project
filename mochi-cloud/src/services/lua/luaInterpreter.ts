// Statement executor for the server scripting Lua subset. Expressions are
// delegated to luaEvaluator so each file stays small and independently testable.

import type { LuaChunk, LuaExpr, LuaStmt } from './luaAst';
import { evaluate, evaluateBinary, evaluateUnary, type EvaluatorHost } from './luaEvaluator';
import { LuaRegistry } from './luaRegistry';
import {
  BreakSignal, Environment, LuaRuntimeError, LuaTable, MultiValue, ReturnSignal,
  display, expandTail, firstValue, type LuaFunctionValue, type LuaResult, type LuaValue
} from './luaValues';

export interface LuaHostApi {
  print(message: string): void;
  fireClient(playerId: string, eventName: string, data: unknown): void;
  broadcast(eventName: string, data: unknown): void;
  setState(key: string, value: unknown): void;
  getState(key: string): unknown;
  playerCount(): number;
}

export interface LuaInterpreterOptions {
  maxSteps?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_STEPS = 200_000;
const DEFAULT_MAX_DEPTH = 48;

export class LuaInterpreter implements EvaluatorHost {
  public readonly globals = new Environment();
  private readonly events = new LuaRegistry();
  /** Lifecycle callbacks (join/leave); never reachable from client RPCs. */
  public readonly lifecycle = new LuaRegistry();
  private steps = 0;
  private depth = 0;

  constructor(private readonly options: LuaInterpreterOptions = {}) {}

  public setGlobal(name: string, value: LuaValue): void {
    this.globals.declare(name, value);
  }

  public addHandler(eventName: string, fn: LuaFunctionValue): void {
    this.events.add(eventName, fn);
  }

  public hasHandler(eventName: string): boolean {
    return this.events.has(eventName);
  }

  public handlerNames(): string[] {
    return this.events.names();
  }

  public run(chunk: LuaChunk): void {
    try {
      this.execBlock(chunk.body, this.globals);
    } catch (err) {
      if (err instanceof ReturnSignal) return;
      throw err;
    }
  }

  public dispatch(eventName: string, player: unknown, data: unknown, playerTable?: LuaTable): boolean {
    const fn = this.events.get(eventName);
    if (!fn) return false;
    const table = playerTable ?? (LuaTable.fromJS(player) as LuaTable);
    this.callFunction(fn, [table, LuaTable.fromJS(data)]);
    return true;
  }

  // --- EvaluatorHost -------------------------------------------------------

  public tick(): void {
    this.steps += 1;
    if (this.steps > (this.options.maxSteps ?? DEFAULT_MAX_STEPS)) {
      throw new LuaRuntimeError('execution step limit exceeded');
    }
  }

  public invoke(callee: LuaValue, args: LuaValue[], name: string): LuaResult {
    if (callee && typeof callee === 'object' && 'kind' in callee) {
      if (callee.kind === 'native') return callee.fn(args);
      return this.callFunction(callee, args);
    }
    throw new LuaRuntimeError(`attempt to call "${name}" which is not a function`);
  }

  public toNumber(value: LuaValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    throw new LuaRuntimeError('attempt to perform arithmetic on a non-number value');
  }

  public truthy(value: LuaValue): boolean {
    return value !== null && value !== false;
  }

  public toKey(value: LuaValue): string | number {
    if (typeof value === 'number' || typeof value === 'string') return value;
    if (typeof value === 'boolean') return String(value);
    throw new LuaRuntimeError('table keys must be strings or numbers');
  }

  public toDisplay(value: LuaValue): string {
    return display(value);
  }

  // --- Statement execution ------------------------------------------------

  private execBlock(body: LuaStmt[], env: Environment): void {
    for (const statement of body) this.execStatement(statement, env);
  }

  private execStatement(statement: LuaStmt, env: Environment): void {
    this.tick();
    switch (statement.type) {
      case 'local': {
        const values = expandTail(statement.values.map((expr) => evaluate(this, expr, env)));
        statement.names.forEach((name, index) => env.declare(name, values[index] ?? null));
        return;
      }
      case 'assign': {
        const values = expandTail(statement.values.map((expr) => evaluate(this, expr, env)));
        statement.targets.forEach((target, index) => {
          this.assignTo(target, values[index] ?? null, env);
        });
        return;
      }
      case 'call':
        evaluate(this, statement.call, env);
        return;
      case 'if': {
        for (const branch of statement.branches) {
          if (!branch.cond || this.truthy(firstValue(evaluate(this, branch.cond, env)))) {
            this.execBlock(branch.body, new Environment(env));
            return;
          }
        }
        return;
      }
      case 'while':
        this.execWhile(statement, env);
        return;
      case 'repeat':
        this.execRepeat(statement, env);
        return;
      case 'forNum':
        this.execNumericFor(statement, env);
        return;
      case 'forIn':
        this.execGenericFor(statement, env);
        return;
      case 'localFunction': {
        const fn: LuaFunctionValue = {
          kind: 'lua',
          params: statement.params,
          body: statement.body,
          env,
          name: statement.name
        };
        env.declare(statement.name, fn);
        return;
      }
      case 'functionDecl': {
        const fn: LuaFunctionValue = {
          kind: 'lua',
          params: statement.params,
          body: statement.body,
          env
        };
        this.assignTo(statement.target, fn, env);
        return;
      }
      case 'return':
        throw new ReturnSignal(expandTail(statement.values.map((expr) => evaluate(this, expr, env))));
      case 'break':
        throw new BreakSignal();
      case 'do':
        this.execBlock(statement.body, new Environment(env));
        return;
      default:
        return;
    }
  }

  private execWhile(statement: Extract<LuaStmt, { type: 'while' }>, env: Environment): void {
    while (this.truthy(firstValue(evaluate(this, statement.cond, env)))) {
      this.tick();
      try {
        this.execBlock(statement.body, new Environment(env));
      } catch (err) {
        if (err instanceof BreakSignal) return;
        throw err;
      }
    }
  }

  private execRepeat(statement: Extract<LuaStmt, { type: 'repeat' }>, env: Environment): void {
    for (;;) {
      this.tick();
      try {
        this.execBlock(statement.body, new Environment(env));
      } catch (err) {
        if (err instanceof BreakSignal) return;
        throw err;
      }
      if (this.truthy(firstValue(evaluate(this, statement.cond, env)))) return;
    }
  }

  private execNumericFor(statement: Extract<LuaStmt, { type: 'forNum' }>, env: Environment): void {
    const start = this.toNumber(firstValue(evaluate(this, statement.start, env)));
    const stop = this.toNumber(firstValue(evaluate(this, statement.stop, env)));
    const step = statement.step ? this.toNumber(firstValue(evaluate(this, statement.step, env))) : 1;
    if (step === 0) throw new LuaRuntimeError('for step cannot be zero');

    for (let i = start; step > 0 ? i <= stop : i >= stop; i += step) {
      this.tick();
      const scope = new Environment(env);
      scope.declare(statement.name, i);
      try {
        this.execBlock(statement.body, scope);
      } catch (err) {
        if (err instanceof BreakSignal) return;
        throw err;
      }
    }
  }

  private execGenericFor(statement: Extract<LuaStmt, { type: 'forIn' }>, env: Environment): void {
    const iterable = firstValue(evaluate(this, statement.values[0], env));
    if (!(iterable instanceof LuaTable)) return;

    for (const key of iterable.keys()) {
      this.tick();
      const scope = new Environment(env);
      scope.declare(statement.names[0], key);
      if (statement.names[1]) scope.declare(statement.names[1], iterable.get(key));
      try {
        this.execBlock(statement.body, scope);
      } catch (err) {
        if (err instanceof BreakSignal) return;
        throw err;
      }
    }
  }

  private assignTo(target: LuaExpr, value: LuaValue, env: Environment): void {
    if (target.type === 'name') {
      if (env.has(target.name)) env.assign(target.name, value);
      else this.globals.declare(target.name, value);
      return;
    }
    if (target.type === 'index') {
      const object = firstValue(evaluate(this, target.target, env));
      if (!(object instanceof LuaTable)) {
        throw new LuaRuntimeError('attempt to index a non-table value');
      }
      object.set(this.toKey(firstValue(evaluate(this, target.key, env))), value);
      return;
    }
    throw new LuaRuntimeError('invalid assignment target');
  }

  private callFunction(fn: LuaFunctionValue, args: LuaValue[]): MultiValue {
    this.depth += 1;
    if (this.depth > (this.options.maxDepth ?? DEFAULT_MAX_DEPTH)) {
      this.depth -= 1;
      throw new LuaRuntimeError('call depth limit exceeded');
    }
    try {
      const scope = new Environment(fn.env);
      fn.params.forEach((param, index) => scope.declare(param, args[index] ?? null));
      try {
        this.execBlock(fn.body, scope);
      } catch (err) {
        if (err instanceof ReturnSignal) return new MultiValue(err.values);
        throw err;
      }
      return new MultiValue([]);
    } finally {
      this.depth -= 1;
    }
  }
}

// Re-exported so callers only need this module for the interpreter surface.
export { evaluateBinary, evaluateUnary };
