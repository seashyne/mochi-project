// Playtest modal: runs the real runtime (physics + Lua + audio) and shows the live HUD
// together with a genre-standard Studio-style Output terminal (logs, sources and Lua code).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, RotateCcw, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { StudioObject } from '../../engine/studio/types';
import { GameState, PlaytestRuntime, SessionConsole } from '../../engine/runtime';
import { LuaUIOverlay } from '../player/LuaUIOverlay';
import { GameHud } from '../runtime/GameHud';
import { SessionTerminal } from '../runtime/SessionTerminal';

export interface StudioPlaytestModalProps {
  isOpen: boolean;
  onClose: () => void;
  objects: StudioObject[];
  worldTitle: string;
}

export const StudioPlaytestModal: React.FC<StudioPlaytestModalProps> = ({
  isOpen,
  onClose,
  objects,
  worldTitle
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PlaytestRuntime | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const [hudState, setHudState] = useState<GameState | null>(null);
  const [terminalSession, setTerminalSession] = useState<SessionConsole | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsMuted(false);
    setIsStarting(true);

    const runtime = new PlaytestRuntime({
      canvas,
      objects: objectsRef.current,
      title: worldTitle
    });
    runtimeRef.current = runtime;
    setHudState(runtime.state);
    setTerminalSession(runtime.consoleSession);

    let cancelled = false;
    runtime
      .start()
      .then(() => {
        if (!cancelled) setIsStarting(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setIsStarting(false);
        runtime.consoleSession.push(
          'error',
          `Failed to start session: ${err instanceof Error ? err.message : String(err)}`,
          'runtime'
        );
      });

    return () => {
      cancelled = true;
      runtime.dispose();
      runtimeRef.current = null;
      setHudState(null);
      setTerminalSession(null);
    };
  }, [isOpen, runId, worldTitle]);

  const handleRestart = useCallback(() => setRunId((value) => value + 1), []);

  const handleToggleMute = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime) setIsMuted(runtime.toggleMute());
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-studio-overlay/85 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-studio-panel border border-studio-border rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh] transition-colors">
        <div className="px-4 py-3 border-b border-studio-border flex items-center justify-between gap-3 bg-studio-card">
          <div className="flex items-center gap-2 min-w-0">
            <Play className="w-4 h-4 text-studio-success shrink-0" />
            <h3 className="text-sm font-extrabold text-studio-text truncate">Playtest: {worldTitle}</h3>
            {isStarting && <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-muted" />}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleToggleMute} className="p-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-card/60 transition-colors" title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button type="button" onClick={handleRestart} className="p-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-card/60 transition-colors" title="Restart session" aria-label="Restart session">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-card/60 transition-colors" aria-label="Close playtest">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          <div className="relative rounded-xl overflow-hidden border border-studio-border bg-studio-bg h-[52vh] min-h-[320px]">
            <canvas key={runId} ref={canvasRef} className="w-full h-full block touch-none" />
            {hudState && <GameHud state={hudState} hint="WASD move · Space jump · Shift sprint · Drag to orbit" />}
            <LuaUIOverlay />
          </div>

          <SessionTerminal
            session={terminalSession}
            title="Playtest Output"
            className="h-[260px]"
            hotkey
          />
        </div>
      </div>
    </div>
  );
};
