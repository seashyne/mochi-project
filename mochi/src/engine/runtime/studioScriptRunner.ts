// Headless runtime session for the Studio Script tab. Seeds the objects currently in
// the editor, executes the editor code through the real Lua API, and exposes the
// shared Output terminal (logs, sources, code and the command bar).

import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import { StudioObject } from '../studio/types';
import { GameRuntime } from './gameRuntime';
import { SessionConsole } from './sessionConsole';
import { RuntimePlayerHandle, RuntimeVec3 } from './types';

class StubPlayer implements RuntimePlayerHandle {
  readonly id = 'studio_player';
  readonly name = 'Creator';
  private health = 100;
  getPosition(): RuntimeVec3 {
    return { x: 0, y: 2, z: 0 };
  }
  setPosition(): void {}
  setVelocity(): void {}
  applyImpulse(): void {}
  respawn(): void {}
  damage(amount: number): void {
    this.health -= amount;
  }
  heal(amount: number): void {
    this.health += amount;
  }
  getHealth(): number {
    return this.health;
  }
  setHealth(value: number): void {
    this.health = value;
  }
  getMaxHealth(): number {
    return 100;
  }
}

export interface ScriptRunSummary {
  executionTimeMs: number;
  hasError: boolean;
  errorMessage: string | null;
}

export class StudioScriptRunner {
  readonly consoleSession = new SessionConsole();
  private runtime: GameRuntime | null = null;

  /** Rebuilds the headless session so each run starts from the current scene. */
  async run(code: string, objects: StudioObject[]): Promise<ScriptRunSummary> {
    const started = performance.now();
    this.reset();
    const runtime = new GameRuntime({
      scene: new THREE.Scene(),
      physics: new PhysicsWorld(),
      player: new StubPlayer(),
      playerBodyId: 'studio_player',
      consoleSession: this.consoleSession
    });
    this.runtime = runtime;
    runtime.seedObjects(objects);
    await runtime.executeCode(code, 'Script Tab');
    await runtime.whenIdle();

    const failure = this.consoleSession.getSnapshot().entries.find((entry) => entry.level === 'error');
    return {
      executionTimeMs: performance.now() - started,
      hasError: Boolean(failure),
      errorMessage: failure?.message ?? null
    };
  }

  dispose(): void {
    this.reset();
    this.consoleSession.dispose();
  }

  private reset(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.consoleSession.clear();
  }
}
