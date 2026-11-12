// Bridge binding Mochi Client Lua engine to multiplayer networking & RPC replication
import { MochiLuaEngine } from './luaEngine';
import { MultiplayerManager } from '../multiplayerManager';

export interface LuaNetworkBinding {
  dispose: () => void;
}

export function bindLuaToMultiplayer(
  luaEngine: MochiLuaEngine,
  multiplayer: MultiplayerManager
): LuaNetworkBinding {
  // 1. Client Lua calling network.FireServer() -> sends RPC packet via multiplayer manager
  luaEngine.setOnFireServer((eventName: string, data?: unknown) => {
    multiplayer.sendScriptRpc(eventName, data);
  });

  // 2. Server sending script_rpc -> dispatches to Lua network.OnClientEvent handlers
  const unsubRpc = multiplayer.onScriptRpc((eventName: string, data: unknown) => {
    luaEngine.dispatchClientEvent(eventName, data);
  });

  // 3. Server replicating state -> updates Lua replicated state table
  const unsubState = multiplayer.onStateReplicate((key: string, value: unknown) => {
    luaEngine.setReplicatedState(key, value);
    // Also trigger OnClientEvent for reactive state bindings
    luaEngine.dispatchClientEvent(`StateChanged_${key}`, value);
  });

  return {
    dispose: () => {
      unsubRpc();
      unsubState();
      luaEngine.setOnFireServer(undefined);
    }
  };
}
