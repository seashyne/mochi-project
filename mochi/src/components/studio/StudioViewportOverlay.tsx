// Floating viewport controls: gizmo modes, clipboard, focus, view presets,
// fly camera and configurable snapping. Kept out of Studio3DCanvas for SRP.

import React, { useState } from 'react';
import {
  Move, RotateCcw, Maximize2, Grid, Copy, Scissors, ClipboardPaste,
  Crosshair, Compass, Plane, Mountain, Settings2, Navigation
} from 'lucide-react';
import type { GizmoMode, GizmoSnapConfig } from '../../engine/studio/transformGizmo';
import type { ViewPreset } from '../../engine/studio/studioCameraRig';
import { VIEW_PRESETS } from '../../engine/studio/studioCameraRig';
import type { TerrainBrush } from '../../engine/studio/advancedTypes';

export interface StudioViewportOverlayProps {
  activeGizmoMode: GizmoMode;
  onGizmoMode: (mode: GizmoMode) => void;
  isSnapping: boolean;
  onToggleSnapping: () => void;
  snapConfig: GizmoSnapConfig;
  onSnapConfig: (patch: Partial<GizmoSnapConfig>) => void;
  flyMode: boolean;
  onToggleFly: () => void;
  onView: (preset: ViewPreset) => void;
  onFocus: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  clipboardCount?: number;
  brush?: TerrainBrush | null;
}

const btn = 'px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all';
const active = 'bg-studio-accent/20 border border-studio-accent/50 text-studio-text shadow-sm';
const idle = 'text-studio-muted hover:text-studio-text hover:bg-studio-card/60';
const mini = 'px-2 py-1.5 rounded-lg text-[10px] font-mono flex items-center gap-1 bg-studio-card border border-studio-border text-studio-text hover:bg-studio-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const StudioViewportOverlay: React.FC<StudioViewportOverlayProps> = ({
  activeGizmoMode, onGizmoMode, isSnapping, onToggleSnapping, snapConfig, onSnapConfig,
  flyMode, onToggleFly, onView, onFocus, onCopy, onCut, onPaste, clipboardCount = 0, brush
}) => {
  const [showSnap, setShowSnap] = useState(false);
  const gizmos: { mode: GizmoMode; key: string; icon: React.ReactNode; title: string }[] = [
    { mode: 'translate', key: 'W', icon: <Move className="w-3.5 h-3.5" />, title: 'Translate Gizmo [W]' },
    { mode: 'rotate', key: 'E', icon: <RotateCcw className="w-3.5 h-3.5" />, title: 'Rotate Gizmo [E]' },
    { mode: 'scale', key: 'R', icon: <Maximize2 className="w-3.5 h-3.5" />, title: 'Scale Gizmo [R]' }
  ];

  return (
    <>
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-studio-panel/90 backdrop-blur-md border border-studio-border text-studio-text shadow-md">
          {gizmos.map((g) => (
            <button key={g.mode} type="button" onClick={() => onGizmoMode(g.mode)} title={g.title}
              className={`${btn} ${activeGizmoMode === g.mode ? active : idle}`}>
              {g.icon}<span>{g.key}</span>
            </button>
          ))}
          <div className="w-px h-4 bg-studio-border mx-0.5" />
          <button type="button" onClick={onToggleSnapping} title="Toggle Grid Snapping"
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1 ${
              isSnapping ? 'bg-studio-warning/20 text-studio-warning border border-studio-warning/40 font-bold' : idle}`}>
            <Grid className="w-3 h-3" /><span>Snap</span>
          </button>
          <button type="button" onClick={() => setShowSnap((prev) => !prev)} title="Snap settings"
            className="px-1.5 py-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-card/60">
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-studio-border mx-0.5" />
          <button type="button" onClick={onCopy} title="Copy (Ctrl+C)" className={mini}><Copy className="w-3 h-3" /></button>
          <button type="button" onClick={onCut} title="Cut (Ctrl+X)" className={mini}><Scissors className="w-3 h-3" /></button>
          <button type="button" onClick={onPaste} disabled={clipboardCount === 0} title="Paste (Ctrl+V)"
            className={`${mini} ${clipboardCount > 0 ? 'text-studio-success' : ''}`}>
            <ClipboardPaste className="w-3 h-3" /><span>{clipboardCount || ''}</span>
          </button>
          <button type="button" onClick={onFocus} title="Focus selection (F)" className={mini}>
            <Crosshair className="w-3 h-3" /><span>F</span>
          </button>
        </div>

        {showSnap && (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-studio-panel/95 backdrop-blur-md border border-studio-border shadow-md text-[10px] font-mono text-studio-muted">
            <span>Grid</span>
            <input type="number" min="0.1" max="16" step="0.5" value={snapConfig.translation}
              onChange={(e) => onSnapConfig({ translation: Number(e.target.value) })}
              className="w-14 px-1 py-0.5 rounded bg-studio-bg border border-studio-border text-studio-text" />
            <span>Deg</span>
            <input type="number" min="1" max="90" step="5" value={snapConfig.rotationDegrees}
              onChange={(e) => onSnapConfig({ rotationDegrees: Number(e.target.value) })}
              className="w-14 px-1 py-0.5 rounded bg-studio-bg border border-studio-border text-studio-text" />
            <span>Scale</span>
            <input type="number" min="0.05" max="4" step="0.05" value={snapConfig.scale}
              onChange={(e) => onSnapConfig({ scale: Number(e.target.value) })}
              className="w-14 px-1 py-0.5 rounded bg-studio-bg border border-studio-border text-studio-text" />
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-studio-panel/90 backdrop-blur-md border border-studio-border shadow-md">
          <Compass className="w-3.5 h-3.5 text-studio-muted mx-1" />
          {VIEW_PRESETS.map((preset: ViewPreset) => (
            <button key={preset} type="button" onClick={() => onView(preset)} title={`${preset} view`} className={mini}>
              <Plane className="w-3 h-3" /><span className="capitalize">{preset}</span>
            </button>
          ))}
          <button type="button" onClick={onToggleFly}
            className={`${mini} ${flyMode ? 'bg-studio-success/20 border-studio-success/50 text-studio-success' : ''}`}
            title="Fly camera: WASD + Q/E (Shift not required)">
            <Navigation className="w-3 h-3" /><span>{flyMode ? 'Fly ON' : 'Fly'}</span>
          </button>
        </div>
        {brush && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-studio-success/15 border border-studio-success/40 text-studio-success text-[10px] font-mono font-bold shadow-md">
            <Mountain className="w-3.5 h-3.5" /><span>SCULPT: {brush.tool.toUpperCase()}</span>
            <span className="text-studio-success/60">r{brush.radius}</span>
          </div>
        )}
        {flyMode && (
          <div className="px-2 py-1 rounded-lg bg-studio-panel/90 border border-studio-border text-[9px] font-mono text-studio-muted">
            W/A/S/D move - Q/E down/up - right-drag pan
          </div>
        )}
      </div>
    </>
  );
};
