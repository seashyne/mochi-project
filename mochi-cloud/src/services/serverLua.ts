// Server-side Lua runtime backed by a real tree-walking interpreter (no eval, no
// WASM), with JS handler fallback, event allowlisting, and replicated state.

import { createLuaSandbox, type LuaSandbox } from './lua/luaSandbox';
import { LuaTable, nativeFn, toJS } from './lua/luaValues';

export interface ServerPlayer {
  id: string;
  username: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface ServerLuaCallbacks {
  onFireClient: (playerId: string, eventName: string, data: unknown) => void;
  onBroadcast: (eventName: string, data: unknown) => void;
  onStateReplicate: (key: string, value: unknown) => void;
  onPlayerDataGet: (playerId: string, key: string) => unknown;
  onPlayerDataSet: (playerId: string, key: string, value: unknown) => void;
}

export type ServerEventHandler = (player: ServerPlayer, data: Record<string, unknown>) => void;

export interface ServerLuaOptions {
  maxSteps?: number;
  maxDepth?: number;
}

export class ServerLuaRuntime {
  private logs: Array<{ level: 'info' | 'warn' | 'error'; message: string; timestamp: number }> = [];
  private jsHandlers: Map<string, ServerEventHandler> = new Map();
  private replicatedState: Map<string, unknown> = new Map();
  private players: Map<string, ServerPlayer> = new Map();
  private callbacks: ServerLuaCallbacks;
  private scriptCode = '';
  private sandbox: LuaSandbox | null = null;
  private allowlist: Set<string> | null = null;

  constructor(callbacks?: Partial<ServerLuaCallbacks>, private readonly options: ServerLuaOptions = {}) {
    this.callbacks = {
      onFireClient: callbacks?.onFireClient || (() => {}),
      onBroadcast: callbacks?.onBroadcast || (() => {}),
      onStateReplicate: callbacks?.onStateReplicate || (() => {}),
      onPlayerDataGet: callbacks?.onPlayerDataGet || (() => null),
      onPlayerDataSet: callbacks?.onPlayerDataSet || (() => {})
    };
  }

  public setCallbacks(callbacks: Partial<ServerLuaCallbacks>): void {
    if (callbacks.onFireClient) this.callbacks.onFireClient = callbacks.onFireClient;
    if (callbacks.onBroadcast) this.callbacks.onBroadcast = callbacks.onBroadcast;
    if (callbacks.onStateReplicate) this.callbacks.onStateReplicate = callbacks.onStateReplicate;
    if (callbacks.onPlayerDataGet) this.callbacks.onPlayerDataGet = callbacks.onPlayerDataGet;
    if (callbacks.onPlayerDataSet) this.callbacks.onPlayerDataSet = callbacks.onPlayerDataSet;
  }

  // Declared remote events from the game manifest. When set, anything else is
  // rejected before it can reach script handlers.
  public setEventAllowlist(eventNames: string[] | null): void {
    this.allowlist = eventNames && eventNames.length > 0
      ? new Set(eventNames.map((name) => name.trim()).filter(Boolean))
      : null;
  }

  public getEventAllowlist(): string[] | null {
    return this.allowlist ? Array.from(this.allowlist) : null;
  }

  public setPlayers(playerList: ServerPlayer[]): void {
    this.players.clear();
    for (const player of playerList) this.players.set(player.id, player);
  }

  public addPlayer(player: ServerPlayer): void {
    this.players.set(player.id, player);
    this.dispatchLifecycle('PlayerAdded', player);
  }

  public removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    // Let the script persist anything it wants before the record disappears.
    if (player) this.dispatchLifecycle('PlayerRemoving', player);
    this.players.delete(playerId);
  }

  private dispatchLifecycle(name: 'PlayerAdded' | 'PlayerRemoving', player: ServerPlayer): void {
    const interpreter = this.sandbox?.interpreter;
    const handler = interpreter?.lifecycle.get(name);
    if (!interpreter || !handler) return;
    try {
      interpreter.invoke(handler, [this.buildPlayerTable(player)], name);
    } catch (err) {
      this.log('error', `Error in ${name}: ${this.messageOf(err)}`);
    }
  }

  public registerHandler(eventName: string, handler: ServerEventHandler): void {
    this.jsHandlers.set(eventName, handler);
  }

  public async loadScript(luaCode: string): Promise<{ success: boolean; error?: string }> {
    this.scriptCode = luaCode;
    this.sandbox = createLuaSandbox(
      {
        print: (message) => this.log('info', message),
        fireClient: (playerId, eventName, data) =>
          this.callbacks.onFireClient(playerId, eventName, data),
        broadcast: (eventName, data) => this.callbacks.onBroadcast(eventName, data),
        setState: (key, value) => this.setState(key, value),
        getState: (key) => this.replicatedState.get(key) ?? null,
        playerCount: () => this.players.size
      },
      this.options
    );

    const result = this.sandbox.run(luaCode);
    if (!result.ok) {
      this.log('error', `Server Lua Error: ${result.error}`);
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  public getHandlerNames(): string[] {
    const names = new Set<string>(this.jsHandlers.keys());
    for (const name of this.sandbox?.interpreter.handlerNames() ?? []) names.add(name);
    return Array.from(names);
  }

  // Dispatch an incoming client RPC to the Lua OnServerEvent handler, falling
  // back to a JS-registered handler when no script is loaded.
  public dispatchServerEvent(playerId: string, eventName: string, data: unknown): boolean {
    if (this.allowlist && !this.allowlist.has(eventName)) {
      this.log('warn', `Rejected undeclared remote event "${eventName}" from ${playerId}`);
      return false;
    }

    const player =
      this.players.get(playerId) ?? { id: playerId, username: `Player_${playerId.slice(0, 4)}` };

    const jsHandler = this.jsHandlers.get(eventName);
    if (jsHandler) {
      try {
        jsHandler(player, (data && typeof data === 'object' ? data : { value: data }) as Record<string, unknown>);
        return true;
      } catch (err) {
        this.log('error', `Error in OnServerEvent(${eventName}): ${this.messageOf(err)}`);
        return false;
      }
    }

    if (this.sandbox?.interpreter.hasHandler(eventName)) {
      try {
        return this.sandbox.interpreter.dispatch(eventName, player, data, this.buildPlayerTable(player));
      } catch (err) {
        this.log('error', `Error in OnServerEvent(${eventName}): ${this.messageOf(err)}`);
        return false;
      }
    }

    return false;
  }

  /**
   * Player table handed to Lua. `player.data` is bound to this player, so a
   * script cannot read or write another player's data by accident.
   */
  private buildPlayerTable(player: ServerPlayer): LuaTable {
    const table = LuaTable.fromJS(player) as LuaTable;
    const data = new LuaTable();

    data.set('get', nativeFn('player.data.get', (args) => {
      const key = String(args[0] ?? '');
      return LuaTable.fromJS(this.callbacks.onPlayerDataGet(player.id, key));
    }));
    data.set('set', nativeFn('player.data.set', (args) => {
      const key = String(args[0] ?? '');
      this.callbacks.onPlayerDataSet(player.id, key, toJS(args[1] ?? null));
      return null;
    }));
    data.set('increment', nativeFn('player.data.increment', (args) => {
      const key = String(args[0] ?? '');
      const delta = Number(args[1] ?? 1);
      const current = Number(this.callbacks.onPlayerDataGet(player.id, key) ?? 0) || 0;
      const next = current + (Number.isFinite(delta) ? delta : 0);
      this.callbacks.onPlayerDataSet(player.id, key, next);
      return next;
    }));

    table.set('data', data);
    return table;
  }

  public getState(key: string): unknown {
    return this.replicatedState.get(key);
  }

  public setState(key: string, value: unknown): void {
    this.replicatedState.set(key, value);
    this.callbacks.onStateReplicate(key, value);
  }

  public getAllState(): Record<string, unknown> {
    return Object.fromEntries(this.replicatedState.entries());
  }

  public getLogs() {
    return [...this.logs];
  }

  public getScriptCode(): string {
    return this.scriptCode;
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.logs.push({ level, message, timestamp: Date.now() });
  }

  private messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
