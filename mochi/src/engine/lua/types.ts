// TypeScript interfaces and types for Mochi Lua Scripting Engine

export type LogLevel = 'info' | 'warn' | 'error';

export interface LuaLogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface LuaPartProxy {
  name: string;
  position: Vector3D;
  rotation: Vector3D;
  visible: boolean;
  rotateY: (deg: number) => void;
  setVisible: (visible: boolean) => void;
  onTouch: (callback: (player: LuaPlayerProxy) => void) => void;
  triggerTouch?: (player: LuaPlayerProxy) => void;
}

export interface LuaPlayerProxy {
  id: string;
  username: string;
  health: number;
  maxHealth: number;
  position: Vector3D;
  addScore: (category: string, amount: number) => void;
  setVelocity?: (x: number, y: number, z: number) => void;
  applyImpulse?: (x: number, y: number, z: number) => void;
  respawn?: () => void;
}

export interface LuaWorldProxy {
  playSound: (soundName: string, position?: Vector3D) => void;
  createPart: (options: Partial<LuaPartProxy>) => LuaPartProxy;
  findPart: (name: string) => LuaPartProxy | undefined;
  setGravity: (x: number, y: number, z: number) => void;
}

export interface LuaDialogueOptions {
  speaker?: string;
  text: string;
  avatar?: string;
  choices?: string[];
  onChoice?: (index: number, choiceText: string) => void;
}

export interface LuaHudElement {
  id: string;
  title: string;
  value?: string | number;
  progress?: number;
  color?: string;
}

export interface LuaUIComponentNode {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown;
}

export interface LuaUiProxy {
  showNotification: (message: string, durationSec?: number) => void;
  setLeaderboard: (category: string, score: number) => void;
  showDialogue: (options: LuaDialogueOptions) => void;
  hideDialogue: () => void;
  setHud: (id: string, element: Partial<LuaHudElement>) => void;
  removeHud: (id: string) => void;
}

export interface LuaNetworkProxy {
  FireServer: (eventName: string, data?: unknown) => void;
  OnClientEvent: (eventName: string, callback: (data: unknown) => void) => void;
  getState: (key: string) => unknown;
}

export interface LuaExecutionResult {
  success: boolean;
  logs: LuaLogEntry[];
  error?: string;
  executionTimeMs: number;
  returnValue?: unknown;
}

export interface MochiScriptEnvironment {
  logs: LuaLogEntry[];
  updateListeners: Array<(deltaTime: number) => void>;
  touchListeners: Array<(player: LuaPlayerProxy) => void>;
  networkHandlers: Map<string, Array<(data: unknown) => void>>;
  networkOutgoing: Array<{ event: string; data?: unknown }>;
  replicatedState: Map<string, unknown>;
}
