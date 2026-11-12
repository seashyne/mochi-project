// Interactive 3D WebGL viewport canvas: scene bootstrap, camera tools and hints.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MousePointer, Eye, ZoomIn, Layers } from 'lucide-react';
import { StudioScene, SelectionCallback, TransformCallback, TransformSetCallback } from '../../engine/studio/studioScene';
import { GizmoMode, DEFAULT_SNAP_CONFIG, GizmoSnapConfig } from '../../engine/studio/transformGizmo';
import { SceneEnvironment } from '../../engine/environment/SceneEnvironment';
import { STARTER_ENVIRONMENT, type EnvironmentState } from '../../engine/environment/environmentTypes';
import { resolveAssetBase } from '../../config/assets';
import type { ViewPreset } from '../../engine/studio/studioCameraRig';
import type { TerrainBrush, TerrainData } from '../../engine/studio/advancedTypes';
import type { StudioObject } from '../../engine/studio/types';
import { StudioViewportOverlay } from './StudioViewportOverlay';
import { useJointOverlay } from './useJointOverlay';

export interface Studio3DCanvasProps {
  sceneEngine: StudioScene;
  onSelect?: SelectionCallback;
  onSelectionSet?: (selectedIds: string[]) => void;
  onTransform?: TransformCallback;
  onTransformSet?: TransformSetCallback;
  environment?: EnvironmentState;
  brush?: TerrainBrush | null;
  onTerrainEdit?: (id: string, terrain: TerrainData) => void;
  objects?: StudioObject[];
  /** Current selection, restored after the scene is rebuilt on remount. */
  selectedIds?: string[];
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  clipboardCount?: number;
  /** Card = rounded floating viewport, docked = edge-to-edge editor pane. */
  variant?: 'card' | 'docked';
  /** Controlled gizmo mode so the ribbon can drive the same tool as the overlay. */
  gizmoMode?: GizmoMode;
  onGizmoModeChange?: (mode: GizmoMode) => void;
  /** Controlled grid snapping so the ribbon and the overlay stay in sync. */
  snapping?: boolean;
  onSnappingChange?: (snapping: boolean) => void;
}

export const Studio3DCanvas: React.FC<Studio3DCanvasProps> = ({
  sceneEngine, onSelect, onSelectionSet, onTransform, onTransformSet,
  environment = STARTER_ENVIRONMENT, brush = null, onTerrainEdit,
  objects = [], selectedIds = [], onCopy, onCut, onPaste, clipboardCount = 0,
  variant = 'card', gizmoMode, onGizmoModeChange, snapping, onSnappingChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const environmentRef = useRef<SceneEnvironment | null>(null);
  const latestEnvironment = useRef<EnvironmentState>(environment);
  // Read through refs inside the init effect so scene churn never depends on
  // document identity or camera mode.
  const objectsRef = useRef<StudioObject[]>(objects);
  objectsRef.current = objects;
  const selectedIdsRef = useRef<string[]>(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [internalGizmoMode, setInternalGizmoMode] = useState<GizmoMode>('translate');
  const [internalSnapping, setInternalSnapping] = useState(false);
  const activeGizmoMode = gizmoMode ?? internalGizmoMode;
  const isSnapping = snapping ?? internalSnapping;
  const [flyMode, setFlyMode] = useState(false);
  const [snapConfig, setSnapConfig] = useState<GizmoSnapConfig>(DEFAULT_SNAP_CONFIG);
  const flyModeRef = useRef(flyMode);

  latestEnvironment.current = environment;
  flyModeRef.current = flyMode;

  const handleSetGizmoMode = useCallback((mode: GizmoMode) => {
    setInternalGizmoMode(mode);
    sceneEngine.setGizmoMode(mode);
    onGizmoModeChange?.(mode);
  }, [sceneEngine, onGizmoModeChange]);

  const handleToggleSnapping = useCallback(() => {
    const next = !isSnapping;
    setInternalSnapping(next);
    sceneEngine.setGizmoSnapping(next);
    onSnappingChange?.(next);
  }, [isSnapping, sceneEngine, onSnappingChange]);

  useEffect(() => {
    if (gizmoMode) sceneEngine.setGizmoMode(gizmoMode);
  }, [gizmoMode, sceneEngine]);

  useEffect(() => {
    if (typeof snapping === 'boolean') sceneEngine.setGizmoSnapping(snapping);
  }, [snapping, sceneEngine]);

  const handleSnapConfig = useCallback((patch: Partial<GizmoSnapConfig>) => {
    setSnapConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sceneEngine.init(canvas, onSelect, onTransform);
    // The page seeds the document before this canvas exists, so a fresh scene
    // would otherwise start empty. Re-mirror on every (re)initialisation.
    if (objectsRef.current.length > 0) sceneEngine.replaceAll(objectsRef.current);
    sceneEngine.selectObjects(selectedIdsRef.current, true);
    sceneEngine.setSelectionSetCallback(onSelectionSet);
    sceneEngine.setTransformSetCallback?.(onTransformSet ?? null);

    const renderer = sceneEngine.getRenderer();
    const scene = sceneEngine.getScene();
    if (renderer && scene) {
      const environmentController = new SceneEnvironment(scene);
      environmentRef.current = environmentController;
      void environmentController.apply(latestEnvironment.current, renderer, { assetBase: resolveAssetBase() });
    }

    const handleResize = () => sceneEngine.resize(canvas.clientWidth || 800, canvas.clientHeight || 500);
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = document.activeElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'Escape') sceneEngine.clearSelection();
      else if (!flyModeRef.current && (e.key === 'w' || e.key === 'W')) handleSetGizmoMode('translate');
      else if (!flyModeRef.current && (e.key === 'e' || e.key === 'E')) handleSetGizmoMode('rotate');
      else if (!flyModeRef.current && (e.key === 'r' || e.key === 'R')) handleSetGizmoMode('scale');
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      environmentRef.current?.dispose();
      environmentRef.current = null;
      sceneEngine.setTerrainBrush(null);
      sceneEngine.setTerrainEditCallback(null);
      sceneEngine.destroy();
    };
  }, [sceneEngine, onSelect, onSelectionSet, onTransform, onTransformSet, handleSetGizmoMode]);

  useEffect(() => { sceneEngine.setTerrainBrush(brush); }, [sceneEngine, brush]);
  useEffect(() => { sceneEngine.setTerrainEditCallback(onTerrainEdit ?? null); }, [sceneEngine, onTerrainEdit]);
  useEffect(() => { sceneEngine.setFlyMode?.(flyMode); }, [sceneEngine, flyMode]);
  useEffect(() => { sceneEngine.setSnapConfig?.(snapConfig); }, [sceneEngine, snapConfig]);
  useEffect(() => {
    const controller = environmentRef.current;
    const renderer = sceneEngine.getRenderer();
    if (controller && renderer) void controller.apply(environment, renderer, { assetBase: resolveAssetBase() });
  }, [environment, sceneEngine]);
  useJointOverlay(sceneEngine, objects);

  const isDocked = variant === 'docked';

  return (
    <div
      className={
        isDocked
          ? 'relative w-full h-full flex-1 overflow-hidden bg-studio-bg'
          : 'relative w-full h-full min-h-[440px] rounded-2xl overflow-hidden border border-studio-border bg-studio-bg shadow-sm flex-1'
      }
    >
      <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />
      <StudioViewportOverlay
        activeGizmoMode={activeGizmoMode}
        onGizmoMode={handleSetGizmoMode}
        isSnapping={isSnapping}
        onToggleSnapping={handleToggleSnapping}
        snapConfig={snapConfig}
        onSnapConfig={handleSnapConfig}
        flyMode={flyMode}
        onToggleFly={() => setFlyMode((prev) => !prev)}
        onView={(preset: ViewPreset) => sceneEngine.getCameraRig()?.setView(preset)}
        onFocus={() => sceneEngine.focusSelection?.()}
        onCopy={onCopy} onCut={onCut} onPaste={onPaste}
        clipboardCount={clipboardCount}
        brush={brush}
      />
      {!isDocked && (
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none text-[10px] font-mono text-studio-muted">
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-studio-panel/90 backdrop-blur-md border border-studio-border text-studio-text shadow-sm">
          <MousePointer className="w-3 h-3 text-studio-accent" /><span>Click: Select</span>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-studio-panel/90 backdrop-blur-md border border-studio-border text-studio-text shadow-sm">
          <Layers className="w-3 h-3 text-studio-violet" /><span>Shift+Click: Multi-select</span>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-studio-panel/90 backdrop-blur-md border border-studio-border text-studio-text shadow-sm">
          <Eye className="w-3 h-3 text-studio-info" /><span>Drag: Orbit</span>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-studio-panel/90 backdrop-blur-md border border-studio-border text-studio-text shadow-sm">
          <ZoomIn className="w-3 h-3 text-studio-success" /><span>Wheel: Zoom</span>
        </div>
        </div>
      )}
    </div>
  );
};
