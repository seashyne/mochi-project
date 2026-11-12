// On-screen Virtual Touch Joystick and Action Buttons for Mobile and Tablet Viewports
// Provides analog thumbstick movement vector and touch Jump/Sprint actions

import React, { useRef, useState, useCallback } from 'react';
import { ArrowUp, Zap } from 'lucide-react';
import { useI18n } from '../../i18n/context';

export interface TouchJoystickProps {
  onMove: (vector: { x: number; y: number }) => void;
  onAction?: (action: 'jump' | 'sprint', active: boolean) => void;
  maxRadius?: number;
  deadzone?: number;
  className?: string;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({
  onMove,
  onAction,
  maxRadius = 50,
  deadzone = 0.1,
  className = ''
}) => {
  const { t } = useI18n();
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const [isThumbActive, setIsThumbActive] = useState(false);
  const [thumbPos, setThumbPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSprinting, setIsSprinting] = useState(false);
  const [isJumping, setIsJumping] = useState(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (activeTouchIdRef.current !== null) return;

      const touch = e.changedTouches[0];
      if (!touch || !baseRef.current) return;

      activeTouchIdRef.current = touch.identifier;
      setIsThumbActive(true);
      setThumbPos({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
    },
    [onMove]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (activeTouchIdRef.current === null || !baseRef.current) return;

      let currentTouch: React.Touch | null = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
          currentTouch = e.changedTouches[i];
          break;
        }
      }
      if (!currentTouch) return;

      const rect = baseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = currentTouch.clientX - centerX;
      const deltaY = currentTouch.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance === 0 || maxRadius <= 0) {
        setThumbPos({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
        return;
      }

      const clampedDist = Math.min(distance, maxRadius);
      const normalizedDist = clampedDist / maxRadius;

      // Update visual knob position within base radius
      const visualX = (deltaX / distance) * clampedDist;
      const visualY = (deltaY / distance) * clampedDist;
      setThumbPos({ x: visualX, y: visualY });

      // Calculate output vector with deadzone and inverted Y (up is positive)
      if (normalizedDist < deadzone) {
        onMove({ x: 0, y: 0 });
      } else {
        const outX = (deltaX / distance) * normalizedDist;
        const outY = -(deltaY / distance) * normalizedDist;
        onMove({ x: outX, y: outY });
      }
    },
    [deadzone, maxRadius, onMove]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (activeTouchIdRef.current === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
          activeTouchIdRef.current = null;
          setIsThumbActive(false);
          setThumbPos({ x: 0, y: 0 });
          onMove({ x: 0, y: 0 });
          break;
        }
      }
    },
    [onMove]
  );

  const handleJumpPress = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setIsJumping(true);
      onAction?.('jump', true);
    },
    [onAction]
  );

  const handleJumpRelease = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setIsJumping(false);
      onAction?.('jump', false);
    },
    [onAction]
  );

  const handleSprintToggle = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setIsSprinting((prev) => {
        const next = !prev;
        onAction?.('sprint', next);
        return next;
      });
    },
    [onAction]
  );

  return (
    <div
      className={`absolute inset-x-0 bottom-12 px-6 flex items-end justify-between pointer-events-none select-none ${className}`}
    >
      {/* Virtual Analog Thumbstick */}
      <div
        ref={baseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`relative w-28 h-28 rounded-full border border-white/15 bg-[#090b10]/60 backdrop-blur-md flex items-center justify-center pointer-events-auto touch-none shadow-lg transition-colors ${
          isThumbActive ? 'border-[#38bdf8]/60 bg-[#090b10]/80' : ''
        }`}
      >
        {/* Direction Crosshair Guides */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/10" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-white/10" />

        {/* Movable Thumb Knob */}
        <div
          style={{
            transform: `translate3d(${thumbPos.x}px, ${thumbPos.y}px, 0)`
          }}
          className={`w-12 h-12 rounded-full border border-white/20 transition-transform duration-75 flex items-center justify-center ${
            isThumbActive
              ? 'bg-[#38bdf8] shadow-[0_0_16px_rgba(56,189,248,0.7)] scale-95'
              : 'bg-[#38bdf8]/40 shadow-sm'
          }`}
        >
          <div className="w-4 h-4 rounded-full bg-white/80" />
        </div>
      </div>

      {/* Action Buttons: Jump and Sprint */}
      <div className="flex items-center gap-3.5 pointer-events-auto touch-none">
        {/* Sprint Toggle Button */}
        <button
          type="button"
          onClick={handleSprintToggle}
          className={`w-14 h-14 rounded-full border backdrop-blur-md flex flex-col items-center justify-center gap-0.5 text-xs font-mono transition-all shadow-md active:scale-95 ${
            isSprinting
              ? 'bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.4)]'
              : 'bg-[#090b10]/60 border-white/15 text-slate-300 active:border-white/30'
          }`}
          aria-label={t.player.toggleSprint}
        >
          <Zap className={`w-4 h-4 ${isSprinting ? 'text-amber-300 fill-amber-300' : 'text-slate-400'}`} />
          <span className="text-[10px] tracking-tight">{t.player.sprintShort}</span>
        </button>

        {/* Jump Button */}
        <button
          type="button"
          onTouchStart={handleJumpPress}
          onTouchEnd={handleJumpRelease}
          onTouchCancel={handleJumpRelease}
          onMouseDown={handleJumpPress}
          onMouseUp={handleJumpRelease}
          className={`w-16 h-16 rounded-full border backdrop-blur-md flex flex-col items-center justify-center gap-0.5 text-xs font-mono transition-all shadow-lg active:scale-95 ${
            isJumping
              ? 'bg-[#00a2ff]/40 border-[#00a2ff] text-white shadow-[0_0_18px_rgba(0,162,255,0.6)]'
              : 'bg-[#090b10]/60 border-white/20 text-white active:border-[#38bdf8]'
          }`}
          aria-label={t.player.jumpAction}
        >
          <ArrowUp className="w-5 h-5 text-emerald-400" />
          <span className="text-[10px] font-bold tracking-tight">{t.player.jumpShort}</span>
        </button>
      </div>
    </div>
  );
};
