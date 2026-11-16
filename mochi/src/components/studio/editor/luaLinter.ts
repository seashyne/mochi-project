// CodeMirror 6 Lint Extension and Navigation for Lua 5.4

import { linter, Diagnostic, lintGutter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { checkLuaSyntax, LuaSyntaxError } from './luaSyntaxChecker';

export function jumpToLine(view: EditorView, line: number, col = 1): void {
  if (!view || !view.state || !view.state.doc) return;

  const totalLines = view.state.doc.lines;
  const safeLine = Number.isFinite(line) ? Math.floor(line) : 1;
  const targetLine = Math.max(1, Math.min(safeLine, totalLines));
  const lineObj = view.state.doc.line(targetLine);
  const safeCol = Number.isFinite(col) ? Math.floor(col) : 1;
  const targetCol = Math.max(0, Math.min(safeCol - 1, lineObj.length));
  const pos = lineObj.from + targetCol;

  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: true,
    effects: EditorView.scrollIntoView(pos, { y: 'center' })
  });
  if (typeof view.focus === 'function') {
    view.focus();
  }
}

export function createLuaLinter(
  onSyntaxErrorChange?: (error: LuaSyntaxError | null) => void
): Extension {
  const lintSource = async (view: EditorView): Promise<Diagnostic[]> => {
    const code = view.state.doc.toString();
    const err = await checkLuaSyntax(code);

    if (onSyntaxErrorChange) {
      onSyntaxErrorChange(err);
    }

    if (!err) {
      return [];
    }

    const totalLines = view.state.doc.lines;
    const errorLine = Math.max(1, Math.min(err.line, totalLines));
    const lineObj = view.state.doc.line(errorLine);

    let from = lineObj.from;
    let to = lineObj.to;

    if (err.column !== undefined && err.column > 0) {
      from = Math.min(lineObj.from + err.column - 1, lineObj.to);
      if (err.token && err.token !== '<eof>' && err.token !== 'eof') {
        to = Math.min(from + err.token.length, lineObj.to);
      } else {
        to = Math.min(from + 1, lineObj.to);
      }
    } else if (err.token && err.token !== '<eof>' && err.token !== 'eof') {
      const idx = lineObj.text.indexOf(err.token);
      if (idx !== -1) {
        from = lineObj.from + idx;
        to = from + err.token.length;
      }
    } else {
      const nonWhitespace = lineObj.text.search(/\S/);
      if (nonWhitespace !== -1) {
        from = lineObj.from + nonWhitespace;
      }
    }

    if (from >= to) {
      to = Math.min(from + 1, view.state.doc.length);
    }

    const tip = err.hint ? `\nTip: ${err.hint}` : '';
    const diag: Diagnostic = {
      from,
      to,
      severity: 'error',
      message: `${err.message}${tip}`,
      source: 'Lua 5.4'
    };

    return [diag];
  };

  return [
    linter(lintSource, { delay: 250 }),
    lintGutter()
  ];
}
