import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Adversarial Challenge Probe 4: Line Limit & Emoji Sweep', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'dist-player',
    'dist-studio',
    '.wrangler',
    '.tmp',
    'coverage',
    'godot-master',
    '.agents',
    '.workbuddy-ai',
    'scripts'
  ]);
  const ignoredFiles = new Set(['package-lock.json', 'godot-master.zip']);
  const ignoredExtensions = new Set(['.glb', '.wasm', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.zip']);
  // Mirrors scripts/check-line-counts.mjs: hygiene rules apply to source files, not binary assets
  const sourceExtensions = /\.(ts|tsx|js|mjs|cjs|css|html|sql|md|json)$/;

  function getTrackedFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          results.push(...getTrackedFiles(fullPath));
        }
      } else if (!ignoredFiles.has(entry.name) && sourceExtensions.test(entry.name)) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!ignoredExtensions.has(ext)) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  it('Probe 4A: confirms every file in the project workspace is strictly <= 300 lines', () => {
    const files = getTrackedFiles(projectRoot);
    const violations: { file: string; lines: number }[] = [];

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const lineCount = content.split('\n').length;
      if (lineCount > 300) {
        violations.push({
          file: path.relative(projectRoot, f),
          lines: lineCount
        });
      }
    }

    expect(violations).toEqual([]);
  });

  it('Probe 4B: confirms zero Unicode emojis or emoticons in any project file', () => {
    const files = getTrackedFiles(projectRoot);
    const emojiRegex =
      /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;

    const emojiViolations: { file: string; line: number; emoji: string }[] = [];

    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        const match = line.match(emojiRegex);
        if (match) {
          emojiViolations.push({
            file: path.relative(projectRoot, f),
            line: idx + 1,
            emoji: match[0]
          });
        }
      });
    }

    expect(emojiViolations).toEqual([]);
  });
});
