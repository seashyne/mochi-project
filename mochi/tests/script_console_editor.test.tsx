// Empirical Verification of ScriptConsole & CodeMirrorEditor Integration and Invariants

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import { ScriptConsole } from '../src/components/studio/ScriptConsole';
import { CodeMirrorEditor } from '../src/components/studio/editor/CodeMirrorEditor';

const M19_TARGET_FILES = [
  'src/components/studio/editor/cmStudioTheme.ts',
  'src/components/studio/editor/luaSyntaxChecker.ts',
  'src/components/studio/editor/luaLinter.ts',
  'src/components/studio/editor/luaCompletions.ts',
  'src/components/studio/editor/luaSnippets.ts',
  'src/components/studio/editor/CodeMirrorEditor.tsx',
  'src/components/studio/ScriptConsole.tsx'
];

const M19_UI_FILES = [
  'src/components/studio/editor/cmStudioTheme.ts',
  'src/components/studio/editor/CodeMirrorEditor.tsx',
  'src/components/studio/ScriptConsole.tsx'
];

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
const LEGACY_BRAND_REGEX = /roblox|rbx/i;

describe('M19 Architectural Invariants & Compliance Rules', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('enforces Single Responsibility Principle (strictly <= 300 lines) across all M19 files', () => {
    M19_TARGET_FILES.forEach((relPath) => {
      const fullPath = path.join(rootDir, relPath);
      expect(fs.existsSync(fullPath), `Target file must exist: ${relPath}`).toBe(true);
      const lineCount = fs.readFileSync(fullPath, 'utf8').split('\n').length;
      expect(lineCount, `${relPath} exceeds 300 line limit (${lineCount} lines)`).toBeLessThanOrEqual(300);
    });
  });

  it('guarantees zero Unicode emojis across all M19 target files', () => {
    M19_TARGET_FILES.forEach((relPath) => {
      const lines = fs.readFileSync(path.join(rootDir, relPath), 'utf8').split('\n');
      lines.forEach((line, idx) => {
        expect(EMOJI_REGEX.test(line), `Emoji in ${relPath}:${idx + 1}`).toBe(false);
      });
    });
  });

  it('guarantees zero legacy platform brands across all M19 target files', () => {
    M19_TARGET_FILES.forEach((relPath) => {
      const lines = fs.readFileSync(path.join(rootDir, relPath), 'utf8').split('\n');
      lines.forEach((line, idx) => {
        expect(LEGACY_BRAND_REGEX.test(line), `Legacy brand in ${relPath}:${idx + 1}`).toBe(false);
      });
    });
  });

  it('verifies all M19 UI presentation files bind semantic studio CSS design tokens', () => {
    const requiredTokens = ['studio-bg', 'studio-panel', 'studio-border', 'studio-text', 'studio-card', 'studio-accent'];
    M19_UI_FILES.forEach((relPath) => {
      const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
      const hasStudioTokens = requiredTokens.some((tok) => content.includes(tok));
      expect(hasStudioTokens, `File ${relPath} should utilize studio semantic design tokens`).toBe(true);
    });
  });
});

describe('ScriptConsole & CodeMirrorEditor SSR and Behavior', () => {
  it('renders ScriptConsole with CodeMirrorEditor SSR fallback, gutter numbers, and code tokens', () => {
    const sampleLua = 'local speed = 100\nprint("Speed is: " .. speed)';
    const html = renderToString(
      <ScriptConsole
        title="Studio Lua Editor"
        code={sampleLua}
        logs={[]}
        onCodeChange={vi.fn()}
        onClear={vi.fn()}
        onRunTest={vi.fn()}
      />
    );

    expect(html).toContain('Studio Lua Editor');
    expect(html).toContain('Run &amp; Test Script');
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('local');
    expect(html).toContain('print');
    expect(html).toContain('Speed is: ');
    expect(html).toContain('bg-studio-panel');
    expect(html).toContain('border-studio-border');
    expect(html).toContain('Insert Snippet...');
  });

  it('renders CodeMirrorEditor standalone SSR fallback with tokens and line numbers', () => {
    const code = 'local a = 1\nlocal b = 2';
    const html = renderToString(
      <CodeMirrorEditor code={code} onCodeChange={vi.fn()} />
    );

    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('local');
    expect(html).toContain('bg-studio-bg');
    expect(html).toContain('border-studio-border');
  });

  it('renders runtime error banner with line number and click-to-jump trigger', () => {
    const sampleLua = 'local a = 10\nlocal b = nil\nprint(b.val)';
    const html = renderToString(
      <ScriptConsole
        code={sampleLua}
        logs={[]}
        hasError={true}
        errorMessage="Runtime error at line 3: attempt to index a nil value"
        onCodeChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(html).toContain('Runtime Error on Line 3:');
    expect(html).toContain('attempt to index a nil value');
    expect(html).toContain('Click to jump to error line');
    expect(html).toContain('Error');
  });
});
