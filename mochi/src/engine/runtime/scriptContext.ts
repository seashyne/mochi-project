// One isolated Lua VM per script. Each VM gets its own `script.parent` binding, so a
// coin script and a hazard script can never see each other's locals or globals.
//
// The script runs inside a coroutine (see luaPrelude.ts) so `task.wait` suspends it
// and the host resumes it on a later frame - the loop patterns creators expect from
// this genre assume exactly that.

import { LuaFactory, LuaEngine as WasmoonEngine } from 'wasmoon';
import { buildRuntimeGlobals } from './luaGlobals';
import { RuntimeApiDeps } from './luaNodeApi';
import { LiveNode } from './liveNode';
import { composeScript } from './luaPrelude';
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
  private stepFn: (() => unknown) | null = null;
  private lineOffset = 0;
  private wakeAt = 0;
  private suspended = false;
  private disposed = false;
  private started = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: ScriptContextOptions) {
    this.node = options.node;
    this.code = options.code;
    this.deps = options.deps;
  }

  get isRunning(): boolean {
    return this.started && !this.disposed;
  }

  /** True while the script is parked in a `task.wait`. */
  get isWaiting(): boolean {
    return this.suspended && !this.disposed;
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
      engine.global.set('__taskSchedule', (seconds: unknown, fn: unknown) => {
        if (typeof fn === 'function') this.scheduleCallback(Number(seconds) || 0, fn as () => void);
      });

      const globals = buildRuntimeGlobals(this.node, this.deps);
      for (const [key, value] of Object.entries(globals)) {
        engine.global.set(key, value);
      }

      const composed = composeScript(this.code);
      this.lineOffset = composed.lineOffset;
      await engine.doString(composed.chunk);

      const step = engine.global.get('__mochi_step');
      if (typeof step !== 'function') return;
      this.stepFn = step as () => unknown;
      // `coroutine.create` only builds the thread; run it to its first yield.
      this.step();
    } catch (err) {
      this.reportError(err);
    }
  }

  /** Resumes the script when its `task.wait` has elapsed. Call once per frame. */
  advance(): void {
    if (!this.suspended || this.disposed) return;
    if (this.deps.getTime() < this.wakeAt) return;
    this.step();
  }

  dispose(): void {
    this.disposed = true;
    this.suspended = false;
    this.stepFn = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (!this.engine) return;
    try {
      this.engine.global.close();
    } catch {
      // Context may already be torn down by wasmoon.
    }
    this.engine = null;
  }

  private step(): void {
    const stepFn = this.stepFn;
    if (!stepFn || this.disposed) return;

    let raw: unknown;
    try {
      raw = stepFn();
    } catch (err) {
      this.suspended = false;
      this.reportError(err);
      return;
    }

    const result = (raw ?? {}) as { ok?: boolean; delay?: number; status?: string; message?: string };
    const ok = Boolean(result.ok);
    const delay = Number(result.delay) || 0;
    const status = String(result.status ?? 'dead');
    const message = String(result.message ?? '');

    if (!ok) {
      this.suspended = false;
      this.reportError(message || 'script error');
      return;
    }
    if (status === 'dead') {
      this.suspended = false;
      return;
    }
    this.suspended = true;
    this.wakeAt = this.deps.getTime() + Math.max(delay, 0);
  }

  /** `task.delay` / the legacy two-argument `task.wait`: a host timer, not a yield. */
  private scheduleCallback(seconds: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.disposed) return;
      try {
        fn();
      } catch (err) {
        this.reportError(err);
      }
    }, Math.max(0, seconds) * 1000);
    this.timers.add(timer);
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const reported = parseLuaErrorLine(message);
    this.deps.log('error', `Script error: ${message}`, this.node.name, {
      code: this.code,
      // The prelude wraps the script, so a raw line number is offset from the
      // creator's code; map it back before showing it.
      line: reported === undefined ? undefined : Math.max(1, reported - this.lineOffset)
    });
  }
}
