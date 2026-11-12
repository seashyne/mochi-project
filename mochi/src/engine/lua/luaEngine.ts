// Core Mochi Lua Engine utilizing WebAssembly sandbox for 120Hz gaming

import { LuaFactory, LuaEngine as WasmoonEngine } from 'wasmoon';
import {
  LuaExecutionResult,
  LuaPartProxy,
  MochiScriptEnvironment
} from './types';
import { injectMochiLuaSandbox } from './bridge';

export class MochiLuaEngine {
  private factory: LuaFactory;
  private engine: WasmoonEngine | null = null;
  private env: MochiScriptEnvironment = {
    logs: [],
    updateListeners: [],
    touchListeners: [],
    networkHandlers: new Map(),
    networkOutgoing: [],
    replicatedState: new Map()
  };
  private isInitialized = false;
  private onFireServerCallback?: (event: string, data?: unknown) => void;

  constructor() {
    this.factory = new LuaFactory();
  }

  public setOnFireServer(cb?: (event: string, data?: unknown) => void): void {
    this.onFireServerCallback = cb;
  }

  public async init(targetPart?: LuaPartProxy): Promise<void> {
    if (this.isInitialized && this.engine) {
      return;
    }
    this.engine = await this.factory.createEngine();
    this.env = {
      logs: [],
      updateListeners: [],
      touchListeners: [],
      networkHandlers: new Map(),
      networkOutgoing: [],
      replicatedState: new Map()
    };
    injectMochiLuaSandbox(this.engine, this.env, targetPart, this.onFireServerCallback);
    this.isInitialized = true;
  }

  public async executeScript(
    code: string,
    targetPart?: LuaPartProxy
  ): Promise<LuaExecutionResult> {
    const startTime = performance.now();
    try {
      if (!this.engine) {
        await this.init(targetPart);
      } else if (targetPart) {
        injectMochiLuaSandbox(this.engine, this.env, targetPart, this.onFireServerCallback);
      }

      if (!this.engine) {
        throw new Error('Lua Engine initialization failed');
      }

      const result = await this.engine.doString(code);
      const executionTimeMs = performance.now() - startTime;

      return {
        success: true,
        logs: [...this.env.logs],
        executionTimeMs,
        returnValue: result
      };
    } catch (err: unknown) {
      const executionTimeMs = performance.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.env.logs.push({
        level: 'error',
        message: `Runtime Error: ${errorMessage}`,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: errorMessage,
        logs: [...this.env.logs],
        executionTimeMs
      };
    }
  }

  public dispatchTick(deltaTime: number): void {
    if (!this.isInitialized || this.env.updateListeners.length === 0) {
      return;
    }

    for (const listener of this.env.updateListeners) {
      try {
        listener(deltaTime);
      } catch (err) {
        this.env.logs.push({
          level: 'error',
          message: `Update Hook Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now()
        });
      }
    }
  }

  public dispatchClientEvent(eventName: string, data?: unknown): void {
    const handlers = this.env.networkHandlers.get(eventName);
    if (!handlers || handlers.length === 0) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        this.env.logs.push({
          level: 'error',
          message: `Client Event [${eventName}] Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now()
        });
      }
    }
  }

  public setReplicatedState(key: string, value: unknown): void {
    this.env.replicatedState.set(key, value);
  }

  public getReplicatedState(key: string): unknown {
    return this.env.replicatedState.get(key);
  }

  public getOutgoingNetworkEvents() {
    return [...this.env.networkOutgoing];
  }

  public clearOutgoingNetworkEvents() {
    this.env.networkOutgoing = [];
  }

  public getLogs() {
    return [...this.env.logs];
  }

  public clearLogs() {
    this.env.logs = [];
  }

  public dispose(): void {
    if (this.engine) {
      try {
        this.engine.global.close();
      } catch {
        // Safe context teardown
      }
      this.engine = null;
    }
    this.isInitialized = false;
    this.env.updateListeners = [];
    this.env.touchListeners = [];
    this.env.networkHandlers.clear();
    this.env.networkOutgoing = [];
    this.env.replicatedState.clear();
  }
}

export const defaultLuaEngine = new MochiLuaEngine();
