// Interactive 3D WebGL2 Game Player Viewport with Glassmorphic HUD, Controls Bar, and Room Chat Drawer
// Connects RuntimeEngine, Procedural Humanoid Avatar, FollowCamera, SceneLoader, and TouchJoystick

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Terminal } from 'lucide-react';
import { RuntimeEngine } from '../engine/runtimeEngine';
import { InputController } from '../engine/inputController';
import { MultiplayerManager } from '../engine/multiplayerManager';
import { CharacterPhysicsController, RigidBody } from '../engine/physics';
import { bindPlayerAvatar } from '../engine/avatar/playerAvatar';
import { FollowCamera } from '../engine/camera/followCamera';
import { attachWorld, WorldAttachment } from '../engine/scene/attachWorld';
import { GameRuntime, GameState, SessionConsole } from '../engine/runtime';
import { applySpawnPoint, createPlayerSession, resolveWorldScript } from '../engine/runtime/playerSession';
import { GameHud } from './runtime/GameHud';
import { useI18n } from '../i18n/context';
import { GameSummary } from '../api/types';
import { gamesApi } from '../api/games';
import { RealtimeRoomClient, readShardParam } from '../api/rooms';
import { RoomInviteChip } from './player/RoomInviteChip';
import { useAuthStore } from '../store/useAuthStore';
import { PlayerControlsBar } from './player/PlayerControlsBar';
import { PlayerChatDrawer } from './player/PlayerChatDrawer';
import { TouchJoystick } from './player/TouchJoystick';
import { LuaUIOverlay } from './player/LuaUIOverlay';
import { summarizeInput, toggleFullscreen } from './player/viewportHelpers';
import { SessionTerminal } from './runtime/SessionTerminal';

export interface PlayerViewportProps {
  activeGame: GameSummary | null;
}

export const PlayerViewport: React.FC<PlayerViewportProps> = ({ activeGame }) => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RuntimeEngine | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const multiplayerRef = useRef<MultiplayerManager | null>(null);
  const roomClientRef = useRef<RealtimeRoomClient | null>(null);
  const localPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeInputSummary, setActiveInputSummary] = useState(t.player.readyInput);
  const [activeRoomClient, setActiveRoomClient] = useState<RealtimeRoomClient | null>(null);
  const [hudState, setHudState] = useState<GameState | null>(null);
  const consoleSession = useMemo(() => new SessionConsole(), []);

  const roomId = activeGame ? `room_${activeGame.slug}` : 'room_lobby_default';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RuntimeEngine();
    const input = new InputController();
    const multiplayer = new MultiplayerManager();
    const playerId = user?.id || `player_${Math.random().toString(36).substring(2, 7)}`;
    const roomClient = new RealtimeRoomClient(roomId, token || undefined, playerId, undefined, true, activeGame?.id, readShardParam());

    const playerBody = new RigidBody({
      id: playerId,
      type: 'dynamic',
      position: { x: 0, y: 1.0, z: 0 },
      shape: { type: 'sphere', radius: 0.6 },
      material: { friction: 0.4, restitution: 0.0 }
    });
    engine.getPhysicsWorld().addBody(playerBody);
    const controller = new CharacterPhysicsController(playerBody, engine.getPhysicsWorld());

    const followCamera = new FollowCamera({ target: playerBody.position });
    engine.setFollowCamera(followCamera);

    engineRef.current = engine;
    inputRef.current = input;
    multiplayerRef.current = multiplayer;
    roomClientRef.current = roomClient;
    setActiveRoomClient(roomClient);

    engine.init(canvas);
    input.attach(canvas);

    const scene = engine.getScene();
    const { avatar, dispose: disposeAvatar } = bindPlayerAvatar();
    let attachment: WorldAttachment | null = null;
    let worldCleanup = () => {};
    let worldUpdate: (position: { x: number; y: number; z: number }) => boolean = () => true;
    let worldReady = false;
    let pausedVelocity: { x: number; y: number; z: number } | null = null;
    playerBody.type = 'kinematic';
    let cancelled = false;
    let manifestScript: string | undefined;
    const rawManifest = (activeGame as unknown as { manifestJson?: string })?.manifestJson;
    let runtime: GameRuntime | null = null;
    let unsubscribeBeforePhysics = () => {};

    if (scene) {
      consoleSession.clear();
      runtime = createPlayerSession({
        scene,
        consoleSession,
        physics: engine.getPhysicsWorld(),
        multiplayer,
        controller,
        body: playerBody,
        playerId,
        playerName: user?.displayName || user?.username || 'Player'
      }).runtime;
      setHudState(runtime.state);
      unsubscribeBeforePhysics = engine.onBeforePhysics((dt) => { runtime?.prePhysics(); attachment?.tick?.(dt); });

      scene.add(avatar.root);
      attachment = attachWorld(scene, rawManifest, engine.getPhysicsWorld());
      manifestScript = attachment.scriptCode;
      worldCleanup = attachment.dispose;
      worldUpdate = attachment.update;

      const applySpawn = (point: { x: number; y: number; z: number } | null) => {
        if (!cancelled) applySpawnPoint(controller, followCamera, point);
      };
      applySpawn(attachment.immediateSpawn ?? null);
      attachment.ready
        .then((point) => {
          applySpawn(point);
          worldReady = Boolean(point);
          if (attachment) runtime?.sync(attachment.getObjects(), attachment.getBindings());
        })
        .catch((error) => { if (!cancelled) console.warn('World loading failed', error); });

      runtime.sync(attachment.getObjects(), attachment.getBindings());
      multiplayer.attach(scene, roomClient);
      engine.setMultiplayerManager(multiplayer);
    }

    if (runtime) {
      const code = resolveWorldScript(rawManifest, manifestScript);
      if (code) runtime.runWorldScript(code);
    }

    roomClient.connect().catch(() => {});
    engine.start();

    if (activeGame?.id) gamesApi.recordPlay(activeGame.id).catch(() => {});

    let lastHudUpdate = 0;
    const HUD_INTERVAL_MS = 250;

    const unsubscribeFps = engine.onFpsUpdate((_currentFps, currentFrameMs) => {
      const state = input.poll();
      const dt = Math.max(0.001, Math.min(0.1, currentFrameMs / 1000));

      if (state.pointer.isDown && (state.pointer.dx !== 0 || state.pointer.dy !== 0)) {
        followCamera.orbit(state.pointer.dx, state.pointer.dy);
      }
      const terrainReady = worldReady && worldUpdate(controller.getPosition());
      if (!terrainReady && playerBody.type === 'dynamic') {
        pausedVelocity = { ...playerBody.velocity };
        playerBody.type = 'kinematic';
        playerBody.setVelocity(0, 0, 0);
      } else if (terrainReady && playerBody.type === 'kinematic') {
        playerBody.type = 'dynamic';
        if (pausedVelocity) playerBody.setVelocity(pausedVelocity.x, pausedVelocity.y, pausedVelocity.z);
        pausedVelocity = null;
      }
      if (terrainReady) controller.update(state.axes, state.actions.jump, state.actions.sprint, dt, followCamera.getYaw());

      const pos = controller.getPosition();
      localPosRef.current.set(pos.x, pos.y, pos.z);
      avatar.root.position.set(pos.x, pos.y, pos.z);
      avatar.root.rotation.y = controller.getFacingAngle();

      const moveMag = Math.hypot(state.axes.x, state.axes.y);
      if (!controller.getGrounded()) {
        avatar.setJumpPose(true);
      } else {
        avatar.stepWalkCycle(moveMag * (state.actions.sprint ? 9.6 : 6.0), dt);
      }

      followCamera.setTarget(pos);
      multiplayer.updateLocalPlayer(localPosRef.current, controller.getFacingAngle());
      runtime?.update(dt);

      // Decouple 60-120Hz physics from React state updates via 4Hz throttle
      const now = performance.now();
      if (now - lastHudUpdate >= HUD_INTERVAL_MS) {
        lastHudUpdate = now;

        if (attachment) runtime?.sync(attachment.getObjects(), attachment.getBindings());
        setActiveInputSummary(summarizeInput(state, controller.getGrounded(), t.player));
      }
    });

    const handleResize = () => {
      if (!canvas) return;
      engine.resize(canvas.clientWidth || 800, canvas.clientHeight || 500);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      handleResize();
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      unsubscribeFps();
      unsubscribeBeforePhysics();
      input.detach();
      multiplayer.detach();
      runtime?.dispose();
      setHudState(null);
      roomClient.disconnect();
      worldCleanup();
      if (scene) scene.remove(avatar.root);
      disposeAvatar();
      engine.destroy();
      setActiveRoomClient(null);
    };
  }, [activeGame, roomId, t.player, token, user?.id]);

  const handleTogglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isPaused) {
      engine.resume();
      setIsPaused(false);
    } else {
      engine.pause();
      setIsPaused(true);
    }
  };

  const handleRestart = () => {
    engineRef.current?.restart();
    setIsPaused(false);
  };

  const handleToggleFullscreen = () => void toggleFullscreen(stageContainerRef.current);

  return (
    <section className="max-w-7xl mx-auto w-full px-2 sm:px-4 py-2 space-y-4">
      <PlayerControlsBar
        title={activeGame ? activeGame.title : t.player.defaultTitle}
        description={activeGame?.description || t.player.defaultDesc}
        isPaused={isPaused}
        isFullscreen={isFullscreen}
        isChatOpen={isChatOpen}
        pauseLabel={t.player.pause} resumeLabel={t.player.resume} resetLabel={t.player.resetScene}
        onTogglePause={handleTogglePause} onRestart={handleRestart}
        onToggleFullscreen={handleToggleFullscreen} onToggleChat={() => setIsChatOpen((prev) => !prev)}
      />

      <div
        ref={stageContainerRef}
        className="relative rounded-2xl overflow-hidden border border-white/[0.09] bg-[#090b10] shadow-mochi-glass"
      >
        <canvas
          ref={canvasRef}
          className={`w-full block cursor-grab active:cursor-grabbing ${
            isFullscreen ? 'h-screen' : 'h-[480px] sm:h-[520px]'
          }`}
        />

        <TouchJoystick
          onMove={(vec) => inputRef.current?.setVirtualJoystick(vec.x, vec.y)}
          onAction={(action, active) => inputRef.current?.setVirtualAction(action, active)}
        />

        <LuaUIOverlay />
        {hudState && <GameHud state={hudState} hint="" />}
        <SessionTerminal session={consoleSession} title="Game Output" containerClassName="absolute bottom-12 left-3 right-3 z-30" className="h-[210px]" hotkey defaultOpen={false} />
        <RoomInviteChip roomClient={activeRoomClient} />

        <PlayerChatDrawer
          roomId={roomId}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          roomClient={activeRoomClient}
        />

        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#090b10]/85 backdrop-blur-md border border-white/[0.08] text-[11px] font-mono text-slate-300 pointer-events-none">
          <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>{t.player.inputController}: {activeInputSummary}</span>
        </div>
      </div>
    </section>
  );
};

export default PlayerViewport;
