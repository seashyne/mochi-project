// React 19 Declarative Overlay for Lua-driven Visual Novel Dialogues & HUD Cards

import React, { useEffect, useState } from 'react';
import { MessageSquare, Sparkles, ChevronRight, X } from 'lucide-react';
import {
  defaultReactLuaStore,
  ReactLuaUIStore
} from '../../engine/lua/reactLuaBridge';
import { LuaDialogueOptions, LuaHudElement } from '../../engine/lua/types';

export interface LuaUIOverlayProps {
  store?: ReactLuaUIStore;
}

export const LuaUIOverlay: React.FC<LuaUIOverlayProps> = ({
  store = defaultReactLuaStore
}) => {
  const [dialogue, setDialogue] = useState<LuaDialogueOptions | null>(store.getDialogue());
  const [hudElements, setHudElements] = useState<LuaHudElement[]>(store.getHudElements());

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setDialogue(store.getDialogue());
      setHudElements(store.getHudElements());
    });
    return unsub;
  }, [store]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-4 overflow-hidden">
      {/* Top Right HUD Cards (State-driven) */}
      <div className="self-end flex flex-col gap-2 max-w-xs pointer-events-auto">
        {hudElements.map((el) => (
          <div
            key={el.id}
            className="px-3.5 py-2 rounded-xl bg-[#090b10]/85 backdrop-blur-md border border-white/[0.1] shadow-lg flex items-center justify-between gap-3 min-w-[140px] transition-all animate-in fade-in slide-in-from-top-2"
          >
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                {el.title}
              </p>
              {el.value !== undefined && (
                <p className="text-sm font-bold font-mono text-white">
                  {el.value}
                </p>
              )}
            </div>
            {el.progress !== undefined && (
              <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, el.progress * 100))}%`,
                    backgroundColor: el.color || '#00a2ff'
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Dialogue Box (Visual Novel / Story style) */}
      {dialogue && (
        <div className="w-full max-w-3xl mx-auto pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="p-5 rounded-2xl bg-[#090b10]/95 backdrop-blur-xl border border-[#00a2ff]/30 shadow-2xl space-y-4">
            {/* Speaker Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#00a2ff]/20 flex items-center justify-center text-[#38bdf8]">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-sm tracking-wide text-white">
                  {dialogue.speaker || 'Narrator'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => store.hideDialogue()}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dialogue Text */}
            <div className="flex items-start gap-4">
              {dialogue.avatar && (
                <img
                  src={dialogue.avatar}
                  alt={dialogue.speaker || 'Avatar'}
                  className="w-14 h-14 rounded-xl border border-white/[0.1] object-cover shrink-0 shadow-md"
                />
              )}
              <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-sans">
                {dialogue.text}
              </p>
            </div>

            {/* Interactive Choices */}
            {dialogue.choices && dialogue.choices.length > 0 ? (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dialogue.choices.map((choice, idx) => (
                  <button
                    key={`${choice}_${idx}`}
                    type="button"
                    onClick={() => store.selectChoice(idx)}
                    className="p-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-[#00a2ff]/20 hover:border-[#00a2ff]/50 border border-white/[0.08] text-xs sm:text-sm font-medium text-left text-white transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{choice}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#38bdf8] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => store.hideDialogue()}
                  className="px-4 py-1.5 rounded-xl bg-[#00a2ff] hover:bg-[#008be0] text-white text-xs font-bold transition-all shadow-md shadow-[#00a2ff]/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Next</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
