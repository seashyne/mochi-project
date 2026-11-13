// Animation editor control panel: clip management, transport, track/keyframe
// editing and capture of live object transforms at the playhead.

import React, { useMemo, useState } from 'react';
import { Play, Pause, Square, Plus, Trash2, Diamond } from 'lucide-react';
import type { StudioObject } from '../../engine/studio/types';
import { useI18n } from '../../i18n/context';
import { AnimationTimeline } from './AnimationTimeline';
import { isAnimatableObject, type CaptureChannels, type StudioAnimationsApi } from './useStudioAnimations';
import type { AnimationEasing } from '../../engine/animation/clip';

const NEXT_EASING: Record<AnimationEasing, AnimationEasing> = {
  linear: 'step', step: 'bezier', bezier: 'linear'
};

const EASING_GLYPH: Record<AnimationEasing, string> = { linear: '╱', step: '⌐', bezier: '~' };

const EASING_LABEL: Record<AnimationEasing, (copy: { easingLinear: string; easingStep: string; easingBezier: string }) => string> = {
  linear: (copy) => copy.easingLinear,
  step: (copy) => copy.easingStep,
  bezier: (copy) => copy.easingBezier
};

export interface StudioAnimationEditorProps {
  api: StudioAnimationsApi;
  objects: StudioObject[];
}

export const StudioAnimationEditor: React.FC<StudioAnimationEditorProps> = ({ api, objects }) => {
  const { t } = useI18n();
  const [channels, setChannels] = useState<CaptureChannels>({ position: true, rotation: true, scale: false });
  const [trackTarget, setTrackTarget] = useState('');

  const animatable = useMemo(() => objects.filter(isAnimatableObject), [objects]);
  const clip = api.selectedClip;
  const objectName = (id: string) => objects.find((object) => object.id === id)?.name ?? id;

  const toggleChannel = (key: keyof CaptureChannels) =>
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto p-3" data-testid="animation-editor">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-studio-text">{t.animation.title}</h2>
        <button
          type="button"
          onClick={api.createClip}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-studio-accent/15 border border-studio-accent/50 text-studio-accent text-xs hover:bg-studio-accent/25"
          data-testid="animation-new-clip"
        >
          <Plus className="w-3.5 h-3.5" /> {t.animation.newClip}
        </button>
      </div>

      {!clip && <p className="text-xs text-studio-muted">{t.animation.noClips}</p>}

      {clip && (
        <>
          <div className="flex items-center gap-2">
            <select
              className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-xs text-studio-text"
              value={clip.id}
              onChange={(event) => api.selectClip(event.target.value)}
              aria-label={t.animation.selectClip}
              data-testid="animation-clip-select"
            >
              {api.clips.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => api.deleteClip(clip.id)}
              className="p-1.5 rounded-lg border border-studio-border text-studio-muted hover:text-studio-danger hover:border-studio-danger/50"
              title={t.animation.deleteClip}
              data-testid="animation-delete-clip"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
              {t.animation.clipName}
              <input
                className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-xs text-studio-text"
                value={clip.name}
                onChange={(event) => api.updateClip(clip.id, { name: event.target.value })}
                data-testid="animation-clip-name"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-studio-muted">
              {t.animation.duration} ({t.animation.seconds})
              <input
                type="number" min={0.1} max={3600} step={0.1}
                className="w-20 bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-xs text-studio-text"
                value={clip.duration}
                onChange={(event) => {
                  const duration = Number(event.target.value);
                  if (Number.isFinite(duration) && duration > 0) api.updateClip(clip.id, { duration });
                }}
                data-testid="animation-duration"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-studio-text pb-2">
              <input
                type="checkbox"
                checked={clip.loop}
                onChange={(event) => api.updateClip(clip.id, { loop: event.target.checked })}
                data-testid="animation-loop"
              />
              {t.animation.loop}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={api.isPlaying ? api.pause : api.play}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-accent text-studio-bg text-xs font-semibold hover:opacity-90"
              data-testid="animation-play-pause"
            >
              {api.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {api.isPlaying ? t.animation.pause : t.animation.play}
            </button>
            <button
              type="button"
              onClick={api.stop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-studio-border text-studio-text text-xs hover:border-studio-accent/50"
              data-testid="animation-stop"
            >
              <Square className="w-3.5 h-3.5" /> {t.animation.stop}
            </button>
            <span className="ml-auto text-xs font-mono text-studio-muted" data-testid="animation-playhead-time">
              {api.playhead.toFixed(2)} / {clip.duration.toFixed(2)}{t.animation.seconds}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-xs text-studio-text"
              value={trackTarget}
              onChange={(event) => setTrackTarget(event.target.value)}
              aria-label={t.animation.target}
              data-testid="animation-track-target"
            >
              <option value="">{t.animation.target}</option>
              {animatable.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
            </select>
            <button
              type="button"
              disabled={!trackTarget}
              onClick={() => { api.addTrack(trackTarget); setTrackTarget(''); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-studio-accent/50 text-studio-accent text-xs disabled:opacity-40"
              data-testid="animation-add-track"
            >
              <Plus className="w-3.5 h-3.5" /> {t.animation.addTrack}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-studio-text">
            {(['position', 'rotation', 'scale'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={channels[key]} onChange={() => toggleChannel(key)} data-testid={`animation-channel-${key}`} />
                {t.animation[key]}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {!clip.tracks.length && <p className="text-xs text-studio-muted">{t.animation.noTracks}</p>}
            {clip.tracks.map((track) => (
              <div key={track.target} className="rounded-lg border border-studio-border bg-studio-panel p-2" data-testid={`animation-track-${track.target}`}>
                <div className="flex items-center gap-2">
                  <Diamond className="w-3 h-3 text-studio-accent" />
                  <span className="text-xs text-studio-text truncate flex-1" title={track.target}>{objectName(track.target)}</span>
                  <button
                    type="button"
                    onClick={() => api.captureKeyframe(track.target, channels)}
                    className="px-2 py-1 rounded-md bg-studio-accent/15 border border-studio-accent/50 text-studio-accent text-[10px] hover:bg-studio-accent/25"
                    data-testid={`animation-capture-${track.target}`}
                  >
                    {t.animation.capture}
                  </button>
                  <button
                    type="button"
                    onClick={() => api.removeTrack(track.target)}
                    className="p-1 rounded-md text-studio-muted hover:text-studio-danger"
                    title={t.animation.removeTrack}
                    data-testid={`animation-remove-track-${track.target}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {track.keyframes.map((keyframe) => (
                    <span key={keyframe.time} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-studio-card border border-studio-border/50 text-[10px] font-mono text-studio-muted">
                      <button type="button" className="hover:text-studio-accent" onClick={() => api.seek(keyframe.time)} title={t.animation.play}>
                        {keyframe.time.toFixed(2)}
                      </button>
                      <button
                        type="button"
                        className="hover:text-studio-accent"
                        onClick={() => api.setKeyframeEasing(track.target, keyframe.time, NEXT_EASING[keyframe.easing ?? 'linear'])}
                        title={EASING_LABEL[keyframe.easing ?? 'linear'](t.animation)}
                        data-testid={`animation-easing-${track.target}-${keyframe.time}`}
                      >
                        {EASING_GLYPH[keyframe.easing ?? 'linear']}
                      </button>
                      <button
                        type="button"
                        className="hover:text-studio-danger"
                        onClick={() => api.deleteKeyframe(track.target, keyframe.time)}
                        title={t.animation.deleteKey}
                        data-testid={`animation-delete-key-${track.target}-${keyframe.time}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <AnimationTimeline clip={clip} playhead={api.playhead} onSeek={api.seek} onDeleteKeyframe={api.deleteKeyframe} />
        </>
      )}
    </div>
  );
};