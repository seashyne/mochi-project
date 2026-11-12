// One isolated Lua VM per script. Each VM gets its own `script.parent` binding, so a
// coin script and a hazard script can never see each other's locals or globals.

import { LuaFactory, LuaEngine as WasmoonEngine } from 'wasmoon';
import { buildRuntimeGlobals } from './luaGlobals';
import { RuntimeApiDeps } from './luaNodeApi';
import { LiveNode } from './liveNode';
import { parseLuaErrorLine } from './sessionConsole';
import { formatLuaArgs } from './types';

const sharedFactory = new LuaFactory();

export interface ScriptContextOptions {
  node: LiveNode;
  code: string;
  deps: RuntimeApiDeps;
}

export class ScriptContext {
  readonly node: LiveNode;
  private readonly code: string;
  private readonly deps: RuntimeApiDeps;
  private engine: WasmoonEngine | null = null;
  private disposed = false;
  private started = false;

  constructor(options: ScriptContextOptions) {
    this.node = options.node;
    this.code = options.code;
    this.deps = options.deps;
  }

  get isRunning(): boolean {
    return this.started && !this.disposed;
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    try {
      const engine = await sharedFactory.createEngine();
      if (this.disposed) {
        engine.global.close();
        return;
      }
      this.engine = engine;
      engine.global.set('print', (...args: unknown[]) => this.deps.log('info', formatLuaArgs(args), this.node.name));
      engine.global.set('warn', (...args: unknown[]) => this.deps.log('warn', formatLuaArgs(args), this.node.name));
      const globals = buildRuntimeGlobals(this.node, this.deps);
      for (const [key, value] of Object.entries(globals)) {
        engine.global.set(key, value);
      }
      await engine.doString(this.code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log('error', `Script error: ${message}`, this.node.name, {
        code: this.code,
        line: parseLuaErrorLine(message)
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (!this.engine) return;
    try {
      this.engine.global.close();
    } catch {
      // Context may already be torn down by wasmoon.
    }
    this.engine = null;
  }
}
