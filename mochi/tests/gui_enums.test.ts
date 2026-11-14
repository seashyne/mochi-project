// The enum surface: one name list, three readers, and a generated Lua table.
//
// The point of these tests is that the Lua side cannot drift from the TypeScript side.
// The table a script sees is generated from `FONT_NAMES`, so a name the reader accepts
// but the prelude omits - or the reverse - would be a value a creator can write and
// never see take effect.

import { describe, it, expect } from 'vitest';
import {
  FILL_DIRECTIONS,
  FONT_NAMES,
  X_ALIGN_NAMES,
  Y_ALIGN_NAMES,
  familyFor,
  toFontName,
  toXAlignName,
  toYAlignName
} from '../src/engine/gui/guiEnums';
import { composeScript } from '../src/engine/runtime/luaPrelude';

describe('GUI enums', () => {
  it('gives every font name a shipped family', () => {
    const families = new Set(['ui', 'mono', 'display']);
    for (const name of FONT_NAMES) {
      expect(families.has(familyFor(name)), `${name} has no family`).toBe(true);
    }
  });

  it('declares each name once', () => {
    expect(new Set(FONT_NAMES).size).toBe(FONT_NAMES.length);
    expect(new Set(X_ALIGN_NAMES).size).toBe(X_ALIGN_NAMES.length);
    expect(new Set(Y_ALIGN_NAMES).size).toBe(Y_ALIGN_NAMES.length);
  });

  it('normalises casing and separators', () => {
    expect(toFontName('roboto mono', 'SourceSans')).toBe('RobotoMono');
    expect(toFontName('GOTHAMBLACK', 'SourceSans')).toBe('GothamBlack');
    expect(toFontName('source_sans_bold', 'SourceSans')).toBe('SourceSansBold');
  });

  it('reads an enum-shaped table as well as a string', () => {
    expect(toFontName({ Name: 'Code' }, 'SourceSans')).toBe('Code');
    expect(toXAlignName({ Name: 'Right' }, 'Center')).toBe('Right');
  });

  it('falls back instead of throwing on an unknown name', () => {
    expect(toFontName('ComicPapyrus', 'SourceSans')).toBe('SourceSans');
    expect(toFontName(undefined, 'SourceSans')).toBe('SourceSans');
    expect(toFontName(42, 'SourceSans')).toBe('SourceSans');
    expect(toXAlignName('middle', 'Center')).toBe('Center');
    expect(toYAlignName('bottom', 'Center')).toBe('Bottom');
  });

  it('ships every name in the prelude a script actually runs', () => {
    const { chunk } = composeScript('return 1');
    for (const name of FONT_NAMES) {
      expect(chunk.includes(`${name} = "${name}"`), `${name} is missing from the prelude`).toBe(true);
    }
    for (const name of [...X_ALIGN_NAMES, ...Y_ALIGN_NAMES, ...FILL_DIRECTIONS]) {
      expect(chunk.includes(`${name} = "${name}"`), `${name} is missing from the prelude`).toBe(true);
    }
  });
});
