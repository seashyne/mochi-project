// Keyframe timeline: time ruler, per-track keyframe diamonds and a draggable
// playhead. Click or drag the time area to scrub; right-click a key to delete.

import React, { useCallback, useRef } from 'react';
import type { MochiAnimationClip } from '../../engine/animation/clip';
import { useI18n } from '../../i18n/context';

export interface AnimationTimelineProps {
  clip: MochiAnimationClip;
  playhead: number;
  onSeek: (time: number) => void;
  onDeleteKeyframe: (target: string, time: number) => void;
}

const TICK_COUNT = 8;

export const AnimationTimeline: React.FC<AnimationTimelineProps> = ({ clip, playhead, onSeek, onDeleteKeyframe }) => {
  const { t } = useI18n();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const timeAt = useCallback((clientX: number): number => {
    const area = areaRef.current;
    if (!area) return 0;
    const rect = area.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * clip.duration;
  }, [clip.duration]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(timeAt(event.clientX));
  }, [onSeek, timeAt]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) onSeek(timeAt(event.clientX));
  }, [onSeek, timeAt]);

  const handlePointerUp = useCallback(() => { draggingRef.current = false; }, []);

  const playheadPercent = clip.duration > 0 ? (playhead / clip.duration) * 100 : 0;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (clip.duration / TICK_COUNT) * i);

  return (
    <div className="flex flex-col rounded-xl border border-studio-border bg-studio-card overflow-hidden" data-testid="animation-timeline">
      <div className="flex">
        <div className="w-36 shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-muted border-b border-r border-studio-border/50">
          {t.animation.keyframes}
        </div>
        <div className="relative flex-1 h-7 border-b border-studio-border/50">
          {ticks.map((time, index) => (
            <span
              key={index}
              className="absolute top-0 h-full border-l border-studio-border/40 pl-1 text-[9px] text-studio-muted leading-7"
              style={{ left: `${(index / TICK_COUNT) * 100}%` }}
            >
              {time.toFixed(1)}{t.animation.seconds}
            </span>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="w-36 shrink-0 border-r border-studio-border/50">
          {clip.tracks.map((track) => (
            <div key={track.target} className="h-8 px-3 flex items-center text-[11px] text-studio-text truncate border-b border-studio-border/30" title={track.target}>
              {track.target}
            </div>
          ))}
          {!clip.tracks.length && (
            <div className="h-8 px-3 flex items-center text-[11px] text-studio-muted">—</div>
          )}
        </div>
        <div
          ref={areaRef}
          className="relative flex-1 cursor-col-resize touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          data-testid="animation-timeline-area"
        >
          {(clip.tracks.length ? clip.tracks : [null]).map((track) => (
            <div key={track?.target ?? 'empty'} className="relative h-8 border-b border-studio-border/30">
              {track?.keyframes.map((keyframe) => (
                <button
                  key={keyframe.time}
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-studio-accent hover:bg-studio-danger border border-studio-bg"
                  style={{ left: `${(keyframe.time / clip.duration) * 100}%` }}
                  title={`${keyframe.time.toFixed(2)}${t.animation.seconds} — ${t.animation.deleteKey}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); onSeek(keyframe.time); }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteKeyframe(track.target, keyframe.time);
                  }}
                  data-testid={`keyframe-${track.target}-${keyframe.time}`}
                />
              ))}
            </div>
          ))}
          <div
            className="absolute top-0 bottom-0 w-px bg-studio-danger pointer-events-none"
            style={{ left: `${playheadPercent}%` }}
            data-testid="animation-playhead"
          >
            <div className="absolute -top-0 -translate-x-1/2 w-2 h-2 bg-studio-danger rotate-45" />
          </div>
        </div>
      </div>
    </div>
  );
};