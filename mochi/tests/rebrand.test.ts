// Unit tests verifying complete platform rebranding to MOCHI

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Platform Rebranding Verification', () => {
  const srcDir = path.resolve(__dirname, '../src');
  const legacyBrand = ['r', 'o', 'b', 'l', 'o', 'x'].join('');
  const legacyPrefix = ['r', 'b', 'x'].join('');

  function getSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getSourceFiles(fullPath));
      } else if (/\.(tsx?|css|html)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('confirms zero case-insensitive occurrences of legacy platform name in mochi/src', () => {
    const files = getSourceFiles(srcDir);
    const matches: { file: string; line: number; text: string }[] = [];
    const pattern = new RegExp(legacyBrand, 'i');

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          matches.push({
            file: path.relative(srcDir, file),
            line: index + 1,
            text: line.trim()
          });
        }
      });
    }

    expect(matches).toEqual([]);
  });

  it('confirms zero case-insensitive occurrences of legacy brand prefix in mochi/src', () => {
    const files = getSourceFiles(srcDir);
    const matches: { file: string; line: number; text: string }[] = [];
    const pattern = new RegExp(legacyPrefix, 'i');

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          matches.push({
            file: path.relative(srcDir, file),
            line: index + 1,
            text: line.trim()
          });
        }
      });
    }

    expect(matches).toEqual([]);
  });

  it('confirms index.css contains --mochi design tokens and no legacy brand prefix tokens', () => {
    const cssContent = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf8');
    expect(cssContent).toContain('--mochi-bg:');
    expect(cssContent).toContain('--mochi-sidebar:');
    expect(cssContent).toContain('--mochi-border:');
    expect(cssContent).not.toContain(`--${legacyPrefix}`);
  });
});
