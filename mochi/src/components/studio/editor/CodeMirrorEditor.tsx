// React CodeMirror 6 Editor for Mochi Studio Lua 5.4 Scripting

import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  StreamLanguage
} from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

import { studioThemeExtension } from './cmStudioTheme';
import { createLuaLinter, jumpToLine } from './luaLinter';
import { luaCompletionsExtension } from './luaCompletions';
import { tokenizeLuaLine, LuaTokenType } from '../luaTokenizer';
import { LuaSyntaxError } from './luaSyntaxChecker';

export interface CodeMirrorEditorProps {
  code: string;
  onCodeChange?: (newCode: string) => void;
  readOnly?: boolean;
  highlightErrorLine?: number | null;
  onJumpToLineRef?: React.MutableRefObject<((line: number, col?: number) => void) | null>;
  onSyntaxError?: (error: LuaSyntaxError | null) => void;
  className?: string;
}

const TOKEN_COLOR_MAP: Record<LuaTokenType, string> = {
  keyword: 'text-studio-violet font-semibold',
  builtin: 'text-studio-info font-semibold',
  string: 'text-studio-success',
  comment: 'text-studio-muted italic',
  number: 'text-studio-warning',
  operator: 'text-studio-muted',
  text: 'text-studio-text'
};

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  code,
  onCodeChange,
  readOnly = false,
  highlightErrorLine,
  onJumpToLineRef,
  onSyntaxError,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [mounted, setMounted] = useState(false);

  const readOnlyCompartment = useMemo(() => new Compartment(), []);
  const lines = useMemo(() => (code || '').split('\n'), [code]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const startState = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        StreamLanguage.define(lua),
        studioThemeExtension,
        createLuaLinter(onSyntaxError),
        luaCompletionsExtension,
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onCodeChange) {
            onCodeChange(update.state.doc.toString());
          }
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab
        ])
      ]
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    if (onJumpToLineRef) {
      onJumpToLineRef.current = (line: number, col = 1) => {
        if (viewRef.current) {
          jumpToLine(viewRef.current, line, col);
        }
      };
    }
    return () => {
      if (onJumpToLineRef) {
        onJumpToLineRef.current = null;
      }
    };
  }, [onJumpToLineRef]);

  useEffect(() => {
    if (viewRef.current && highlightErrorLine && highlightErrorLine > 0) {
      jumpToLine(viewRef.current, highlightErrorLine);
    }
  }, [highlightErrorLine]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (code !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: code }
      });
    }
  }, [code]);

  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly))
      });
    }
  }, [readOnly, readOnlyCompartment]);

  if (!mounted) {
    return (
      <div className={`relative flex rounded-xl border border-studio-border bg-studio-bg overflow-hidden h-72 ${className}`}>
        <div className="w-11 shrink-0 bg-studio-panel/70 border-e border-studio-border select-none text-studio-muted text-end pe-2.5 py-3 font-mono text-xs leading-6 overflow-hidden">
          {lines.map((_, idx) => (
            <div key={idx} className="h-6">
              {idx + 1}
            </div>
          ))}
        </div>
        <div className="flex-1 p-3 font-mono text-xs leading-6 pointer-events-none overflow-hidden whitespace-pre text-studio-text">
          {lines.map((line, idx) => {
            const tokens = tokenizeLuaLine(line);
            return (
              <div key={idx} className="h-6">
                {tokens.map((tok, tIdx) => (
                  <span key={tIdx} className={TOKEN_COLOR_MAP[tok.type]}>
                    {tok.value}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col rounded-xl border border-studio-border bg-studio-bg overflow-hidden h-72 ${className}`}
    />
  );
};

export default CodeMirrorEditor;
