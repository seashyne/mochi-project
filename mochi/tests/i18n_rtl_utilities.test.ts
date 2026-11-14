// Direction-independence probe: layout must not assume left-to-right.
//
// The registry can declare a right-to-left locale at any time. When it does, the
// only thing that keeps the UI usable is that every horizontal offset is written
// with a logical property (ms/me/ps/pe/start/end/text-start/text-end/gap-x) and
// not with a physical one (ml/mr/pl/pr/left/right/space-x).
//
// This probe is deliberately strict: it fails on the physical form even though
// the physical form still renders correctly today, because the cost of the
// rewrite grows with every component added after this point.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../src');

// Centring pairs a physical anchor with a physical translate, so `left-1/2`
// is correct in both directions and is the one allowed exception.
const ALLOWED = [/^-?left-1\/2$/, /^-?right-1\/2$/];

const PHYSICAL = [
  /\b(?:ml|mr|pl|pr)-\d[\w./-]*/g,
  /\btext-(?:left|right)\b/g,
  /\bspace-x-\d[\w.]*/g,
  /\bborder-[lr](?:-\d[\w.]*)?(?![\w-])/g,
  /\b(?:left|right)-\d[\w./-]*/g,
  /\b(?:left|right)-full\b/g
];

interface Violation {
  file: string;
  line: number;
  token: string;
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectFiles(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of collectFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, index) => {
      for (const pattern of PHYSICAL) {
        for (const match of text.matchAll(pattern)) {
          const token = match[0];
          if (ALLOWED.some((ok) => ok.test(token))) continue;
          violations.push({ file: path.relative(SRC, file), line: index + 1, token });
        }
      }
    });
  }
  return violations;
}

describe('RTL readiness: no direction-dependent layout utilities', () => {
  it('uses logical spacing, alignment and anchoring in every component', () => {
    const violations = scan();
    const summary = violations.slice(0, 12).map((v) => `${v.file}:${v.line} ${v.token}`);
    expect(summary, 'physical direction utilities found').toEqual([]);
  });

  it('keeps the centring anchor as the only physical exception', () => {
    const centring = collectFiles(SRC).filter((file) =>
      /\b(?:left|right)-1\/2\b/.test(fs.readFileSync(file, 'utf8'))
    );
    // Not an assertion about quality: it documents where the exception lives so a
    // later reader knows the allowlist is real and not a blanket escape hatch.
    for (const file of centring) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).toMatch(/translate-x-1\/2|translate-y-1\/2/);
    }
  });
});
