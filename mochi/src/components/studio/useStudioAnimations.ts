// Animation editor state: clip CRUD, keyframe capture from live scene
// transforms, and preview playback through the engine AnimationPlayer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { StudioScene } from '../../engine/studio/studioScene';
import type { StudioObject } from '../../engine/studio/types';
import { instancedKindFor } from '../../engine/scene/instancedBatch';
import { AnimationPlayer, createMeshResolver, type AnimationHandle } from '../../engine/animation/animationPlayer';
import { createEmptyClip, type AnimationEasing, type AnimationKeyframe, type MochiAnimationClip } from '../../engine/animation/clip';
import { applySampledTransform, removeKeyframe, sampleTrack, upsertKeyframe } from '../../engine/animation/sampling';
import type { AnimStateMachineDef } from '../../engine/animation/stateMachine';
import { DEFAULT_EASE } from '../../engine/animation/bezier';

export interface CaptureChannels {
  position: boolean;
  rotation: boolean;
  scale: boolean;
}

export interface StudioAnimationsApi {
  clips: MochiAnimationClip[];
  // Optional parameter-driven graph. Null means "just play the clips".
  graph: AnimStateMachineDef | null;
  setGraph: (graph: AnimStateMachineDef | null) => void;
  selectedClipId: string | null;
  selectedClip: MochiAnimationClip | null;
  playhead: number;
  isPlaying: boolean;
  selectClip: (id: string | null) => void;
  createClip: () => void;
  deleteClip: (id: string) => void;
  updateClip: (id: string, patch: Partial<Pick<MochiAnimationClip, 'name' | 'duration' | 'loop'>>) => void;
  replaceClips: (clips: MochiAnimationClip[]) => void;
  addTrack: (target: string) => void;
  removeTrack: (target: string) => void;
  captureKeyframe: (target: string, channels: CaptureChannels) => void;
  deleteKeyframe: (target: string, time: number) => void;
  setKeyframeEasing: (target: string, time: number, easing: AnimationEasing) => void;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export function isAnimatableObject(object: StudioObject): boolean {
  if (object.type === 'constraint' || object.type === 'particle') return false;
  return object.type === 'model' || Boolean(object.luaScript?.trim()) || !instancedKindFor(object.type);
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function useStudioAnimations(sceneEngine: StudioScene, objects: StudioObject[]): StudioAnimationsApi {
  const [clips, setClips] = useState<MochiAnimationClip[]>([]);
  const [graph, setGraph] = useState<AnimStateMachineDef | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const playerRef = useRef<AnimationPlayer | null>(null);
  const handleRef = useRef<AnimationHandle | null>(null);
  const frameRef = useRef(0);
  const lastTickRef = useRef(0);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const selectedRef = useRef(selectedClipId);
  selectedRef.current = selectedClipId;

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? null,
    [clips, selectedClipId]
  );

  const findMesh = useCallback((target: string): THREE.Object3D | null => {
    const scene = sceneEngine.getScene();
    if (!scene) return null;
    const slash = target.indexOf('/');
    const id = slash < 0 ? target : target.slice(0, slash);
    const mesh = scene.children.find((child) => (child.userData as { id?: string }).id === id) ?? null;
    if (!mesh || slash < 0) return mesh;
    return mesh.getObjectByName(target.slice(slash + 1)) ?? null;
  }, [sceneEngine]);

  const restoreTransforms = useCallback(() => {
    for (const object of objectsRef.current) {
      const mesh = findMesh(object.id);
      if (!mesh) continue;
      mesh.position.set(object.position.x, object.position.y, object.position.z);
      mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
      mesh.scale.set(object.scale.x, object.scale.y, object.scale.z);
    }
  }, [findMesh]);

  const cancelLoop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    cancelLoop();
    handleRef.current = null;
    playerRef.current?.stopAll();
    setIsPlaying(false);
    setPlayhead(0);
    restoreTransforms();
  }, [cancelLoop, restoreTransforms]);

  const applyAtTime = useCallback((clip: MochiAnimationClip, time: number) => {
    for (const track of clip.tracks) {
      const mesh = findMesh(track.target);
      if (!mesh) continue;
      applySampledTransform(mesh, sampleTrack(track, time));
    }
  }, [findMesh]);

  const seek = useCallback((time: number) => {
    const clip = clipsRef.current.find((entry) => entry.id === selectedRef.current);
    if (!clip) return;
    const clamped = Math.max(0, Math.min(clip.duration, time));
    setPlayhead(clamped);
    if (handleRef.current) {
      handleRef.current.setTime(clamped);
    } else {
      applyAtTime(clip, clamped);
    }
  }, [applyAtTime]);

  const play = useCallback(() => {
    const clip = clipsRef.current.find((entry) => entry.id === selectedRef.current);
    const scene = sceneEngine.getScene();
    if (!clip || !scene || !clip.tracks.length) return;
    cancelLoop();
    playerRef.current?.stopAll();
    if (!playerRef.current) playerRef.current = new AnimationPlayer();
    const handle = playerRef.current.play(scene, clip, createMeshResolver(scene.children));
    if (!handle) return;
    handle.setTime(playhead >= clip.duration ? 0 : playhead);
    handleRef.current = handle;
    setIsPlaying(true);
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      playerRef.current?.update(dt);
      const current = handle.getTime();
      setPlayhead(current);
      if (!handle.isRunning()) {
        setIsPlaying(false);
        frameRef.current = 0;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [sceneEngine, cancelLoop, playhead]);

  const pause = useCallback(() => {
    cancelLoop();
    handleRef.current?.pause();
    setIsPlaying(false);
  }, [cancelLoop]);

  useEffect(() => () => {
    cancelLoop();
    playerRef.current?.dispose();
    playerRef.current = null;
  }, [cancelLoop]);

  const mutateClip = useCallback((id: string, mutate: (clip: MochiAnimationClip) => MochiAnimationClip) => {
    setClips((prev) => prev.map((clip) => (clip.id === id ? mutate(clip) : clip)));
  }, []);

  const mutateTrack = useCallback((clipId: string, target: string, mutate: (track: MochiAnimationClip['tracks'][number]) => MochiAnimationClip['tracks'][number]) => {
    mutateClip(clipId, (clip) => ({
      ...clip,
      tracks: clip.tracks.map((track) => (track.target === target ? mutate(track) : track))
    }));
  }, [mutateClip]);

  const createClip = useCallback(() => {
    const clip = createEmptyClip(`clip_${Date.now()}_${clipsRef.current.length + 1}`, `Animation ${clipsRef.current.length + 1}`);
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
    setPlayhead(0);
  }, []);

  const deleteClip = useCallback((id: string) => {
    stop();
    setClips((prev) => prev.filter((clip) => clip.id !== id));
    setSelectedClipId((prev) => (prev === id ? null : prev));
  }, [stop]);

  const updateClip = useCallback((id: string, patch: Partial<Pick<MochiAnimationClip, 'name' | 'duration' | 'loop'>>) => {
    mutateClip(id, (clip) => ({ ...clip, ...patch }));
  }, [mutateClip]);

  const replaceClips = useCallback((next: MochiAnimationClip[]) => {
    stop();
    setClips(next);
    setSelectedClipId(next[0]?.id ?? null);
  }, [stop]);

  const addTrack = useCallback((target: string) => {
    const id = selectedRef.current;
    if (!id) return;
    mutateClip(id, (clip) => clip.tracks.some((track) => track.target === target)
      ? clip
      : { ...clip, tracks: [...clip.tracks, { target, keyframes: [] }] });
  }, [mutateClip]);

  const removeTrack = useCallback((target: string) => {
    const id = selectedRef.current;
    if (!id) return;
    mutateClip(id, (clip) => ({ ...clip, tracks: clip.tracks.filter((track) => track.target !== target) }));
  }, [mutateClip]);

  const captureKeyframe = useCallback((target: string, channels: CaptureChannels) => {
    const id = selectedRef.current;
    const mesh = findMesh(target);
    if (!id || !mesh) return;
    const keyframe: AnimationKeyframe = { time: round(playhead) };
    if (channels.position) keyframe.position = { x: round(mesh.position.x), y: round(mesh.position.y), z: round(mesh.position.z) };
    if (channels.rotation) keyframe.rotation = { x: round(mesh.rotation.x), y: round(mesh.rotation.y), z: round(mesh.rotation.z) };
    if (channels.scale) keyframe.scale = { x: round(mesh.scale.x), y: round(mesh.scale.y), z: round(mesh.scale.z) };
    if (!keyframe.position && !keyframe.rotation && !keyframe.scale) return;
    mutateTrack(id, target, (track) => upsertKeyframe(track, keyframe));
  }, [findMesh, mutateTrack, playhead]);

  const deleteKeyframe = useCallback((target: string, time: number) => {
    const id = selectedRef.current;
    if (!id) return;
    mutateTrack(id, target, (track) => removeKeyframe(track, time));
  }, [mutateTrack]);

  const setKeyframeEasing = useCallback((target: string, time: number, easing: AnimationEasing) => {
    const id = selectedRef.current;
    if (!id) return;
    mutateTrack(id, target, (track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) =>
        Math.abs(keyframe.time - time) <= 1e-6
          ? { ...keyframe, easing, ease: easing === 'bezier' ? keyframe.ease ?? DEFAULT_EASE : keyframe.ease }
          : keyframe)
    }));
  }, [mutateTrack]);

  return {
    clips, graph, setGraph, selectedClipId, selectedClip, playhead, isPlaying,
    selectClip: (id) => { stop(); setSelectedClipId(id); },
    createClip, deleteClip, updateClip, replaceClips,
    addTrack, removeTrack, captureKeyframe, deleteKeyframe, setKeyframeEasing,
    seek, play, pause, stop
  };
}