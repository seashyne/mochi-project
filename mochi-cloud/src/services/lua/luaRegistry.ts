// Named Lua function registry shared by the remote-event and lifecycle handler
// tables. Keeping it separate lets the interpreter stay under the file ceiling.

import type { LuaFunctionValue } from './luaValues';

export class LuaRegistry {
  private readonly entries = new Map<string, LuaFunctionValue>();

  public add(name: string, fn: LuaFunctionValue): void {
    this.entries.set(name, fn);
  }

  public has(name: string): boolean {
    return this.entries.has(name);
  }

  public get(name: string): LuaFunctionValue | undefined {
    return this.entries.get(name);
  }

  public names(): string[] {
    return Array.from(this.entries.keys());
  }
}
