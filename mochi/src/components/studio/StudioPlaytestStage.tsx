// In-viewport play mode: runs the real runtime (physics + Lua + audio) on the
// editor canvas slot, with a play badge and stop / restart / mute controls.
//
// Session messages are forwarded to the editor Output dock so play logs land in
// the same console the creator already watches.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Square, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { GameState, PlaytestRuntime, SessionConsole } from '../../engine/runtime';
import type { StudioObject } from '../../engine/studio/types';
import { LuaUIOverlay } from '../player/LuaUIOverlay';
import { GameHud } from '../runtime/GameHud';

export type PlaytestLogLevel = 'info' | 'warn' | 'error';

export interface StudioPlaytestStageProps {
  objects: StudioObject[];
  title: string;
  onStop: () => void;
  onLog?: (level: PlaytestLogLevel, message: string) => void;
}

const LEVEL_MAP: Record<string, PlaytestLogLevel> = { error: 'error', warn: 'warn', info: 'info', success: 'info' };

export const StudioPlaytestStage: React.FC<StudioPlaytestStageProps> = ({ objects, title, onStop, onLog }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PlaytestRuntime | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const [hudState, setHudState] = useState<GameState | null>(null);
  const [session, setSession] = useState<SessionConsole | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsMuted(false);
    setIsStarting(true);
    const runtime = new PlaytestRuntime({ canvas, objects: objectsRef.current, title });
    runtimeRef.current = runtime;
    setHudState(runtime.state);
    setSession(runtime.consoleSession);

    let cancelled = false;
    runtime
      .start()
      .then(() => {
        if (!cancelled) setIsStarting(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setIsStarting(false);
        runtime.consoleSession.push('error', `Failed to start session: ${err instanceof Error ? err.message : String(err)}`, 'runtime');
      });

    return () => {
      cancelled = true;
      runtime.dispose();
      runtimeRef.current = null;
      setHudState(null);
      setSession(null);
    };
  }, [runId, title]);

  // Forward new session entries into the editor console.
  useEffect(() => {
    if (!session || !onLog) return;
    const seen = new Set<string>();
    const forward = () => {
      for (const entry of session.getSnapshot().entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        onLog(LEVEL_MAP[entry.level] ?? 'info', `[play] ${entry.message}`);
      }
    };
    forward();
    return session.subscribe(forward);
  }, [session, onLog]);

  const restart = useCallback(() => setRunId((value) => value + 1), []);
  const toggleMute = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime) setIsMuted(runtime.toggleMute());
  }, []);

  return (
    <div className="relative flex-1 min-h-0 bg-studio-bg">
      <canvas key={runId} ref={canvasRef} className="w-full h-full block touch-none" />
      {hudState && <GameHud state={hudState} hint="WASD move - Space jump - Shift sprint - Drag to orbit" />}
      <LuaUIOverlay />

      <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-auto">
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-studio-panel/90 border border-studio-success/40 text-[10px] font-mono uppercase tracking-wider text-studio-success backdrop-blur-md">
          {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {isStarting ? 'Starting' : 'Playing'}
        </span>
        <button
          type="button"
          onClick={onStop}
          title="Stop the session (Esc)"
          aria-label="Stop playtest"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-studio-danger/20 border border-studio-danger/50 text-[10px] font-mono uppercase tracking-wider text-studio-danger hover:bg-studio-danger/30 transition-colors backdrop-blur-md"
        >
          <Square className="w-3 h-3" />
          Stop
        </button>
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="p-1.5 rounded-md bg-studio-panel/90 border border-studio-border text-studio-muted hover:text-studio-text transition-colors backdrop-blur-md"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={restart}
          title="Restart session"
          aria-label="Restart session"
          className="p-1.5 rounded-md bg-studio-panel/90 border border-studio-border text-studio-muted hover:text-studio-text transition-colors backdrop-blur-md"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
