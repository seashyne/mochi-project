// React-Lua Declarative UI and Dialogue Bridge for Mochi Engine
// Binds Lua UI state, React.createElement, and Narrative Dialogue to React 19 viewports

import { LuaEngine as WasmoonEngine } from 'wasmoon';
import {
  LuaDialogueOptions,
  LuaHudElement,
  LuaUIComponentNode,
  MochiScriptEnvironment
} from './types';

export class ReactLuaUIStore {
  private activeDialogue: LuaDialogueOptions | null = null;
  private hudElements: Map<string, LuaHudElement> = new Map();
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getDialogue(): LuaDialogueOptions | null {
    return this.activeDialogue;
  }

  public getHudElements(): LuaHudElement[] {
    return Array.from(this.hudElements.values());
  }

  public showDialogue(options: LuaDialogueOptions): void {
    this.activeDialogue = options;
    this.notify();
  }

  public hideDialogue(): void {
    this.activeDialogue = null;
    this.notify();
  }

  public selectChoice(index: number): void {
    if (!this.activeDialogue) return;
    const choices = this.activeDialogue.choices || [];
    const choiceText = choices[index] || '';
    const cb = this.activeDialogue.onChoice;

    this.activeDialogue = null;
    this.notify();

    if (typeof cb === 'function') {
      try {
        cb(index + 1, choiceText); // Lua 1-based index convention
      } catch (err) {
        console.error('Error in Lua onChoice callback:', err);
      }
    }
  }

  public setHud(id: string, element: Partial<LuaHudElement>): void {
    const existing = this.hudElements.get(id);
    const updated: LuaHudElement = {
      id,
      title: element.title || existing?.title || id,
      value: element.value !== undefined ? element.value : existing?.value,
      progress: element.progress !== undefined ? element.progress : existing?.progress,
      color: element.color || existing?.color || '#00a2ff'
    };
    this.hudElements.set(id, updated);
    this.notify();
  }

  public removeHud(id: string): void {
    if (this.hudElements.delete(id)) {
      this.notify();
    }
  }

  public clearAll(): void {
    this.activeDialogue = null;
    this.hudElements.clear();
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error notifying React UI listener:', err);
      }
    });
  }
}

export const defaultReactLuaStore = new ReactLuaUIStore();

// Injects React declarative components and UI proxies into Lua runtime
export function injectReactLuaBridge(
  lua: WasmoonEngine,
  env: MochiScriptEnvironment,
  store: ReactLuaUIStore = defaultReactLuaStore
): void {
  // 1. Declarative React proxy (Roact / React-Lua style)
  const reactProxy = {
    createElement: (type: string, props?: Record<string, unknown>, children?: unknown): LuaUIComponentNode => {
      const node: LuaUIComponentNode = {
        type: String(type),
        props: props && typeof props === 'object' ? props : {},
        children: children ? (Array.isArray(children) ? children : [children]) : []
      };
      return node;
    },
    useState: (initialValue: unknown) => {
      let state = initialValue;
      const getState = () => state;
      const setState = (newVal: unknown) => {
        state = newVal;
        return state;
      };
      return [getState, setState];
    }
  };
  lua.global.set('React', reactProxy);
  lua.global.set('Roact', reactProxy); // Declarative component alias

  // 2. Enhanced UI proxy with Story & Dialogue
  const ui = lua.global.get('ui') || {};
  ui.showDialogue = (options: Record<string, unknown>) => {
    const choices = Array.isArray(options.choices)
      ? options.choices.map(String)
      : Object.values((options.choices as Record<string, unknown>) || {}).map(String);

    store.showDialogue({
      speaker: typeof options.speaker === 'string' ? options.speaker : undefined,
      text: String(options.text || ''),
      avatar: typeof options.avatar === 'string' ? options.avatar : undefined,
      choices: choices.length > 0 ? choices : undefined,
      onChoice: typeof options.onChoice === 'function' ? (options.onChoice as LuaDialogueOptions['onChoice']) : undefined
    });

    env.logs.push({
      level: 'info',
      message: `[UI Dialogue] ${options.speaker ? options.speaker + ': ' : ''}${options.text}`,
      timestamp: Date.now()
    });
  };

  ui.hideDialogue = () => store.hideDialogue();

  ui.setHud = (id: string, element: Record<string, unknown>) => {
    store.setHud(String(id), {
      title: element.title ? String(element.title) : String(id),
      value: element.value !== undefined ? (element.value as string | number) : undefined,
      progress: typeof element.progress === 'number' ? element.progress : undefined,
      color: typeof element.color === 'string' ? element.color : undefined
    });
  };

  ui.removeHud = (id: string) => store.removeHud(String(id));
  lua.global.set('ui', ui);

  // 3. Narrative Story helper (Ren'Py shorthand)
  const storyHelper = {
    scene: (bgName: string) => {
      env.logs.push({ level: 'info', message: `[Story Scene] Set background to ${bgName}`, timestamp: Date.now() });
    },
    show: (character: string, mood?: string) => {
      env.logs.push({ level: 'info', message: `[Story Actor] Show ${character} (${mood || 'normal'})`, timestamp: Date.now() });
    },
    say: (speaker: string, text: string, choices?: unknown[], onChoice?: LuaDialogueOptions['onChoice']) => {
      ui.showDialogue({
        speaker,
        text,
        choices,
        onChoice
      });
    }
  };
  lua.global.set('story', storyHelper);
}
