// Avatar editor UI rendering, sidebar entry wiring, and compliance invariants

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import { AvatarEditorModal } from '../src/components/avatar/AvatarEditorModal';
import { AvatarColorControls } from '../src/components/avatar/AvatarColorControls';
import { AvatarCatalogPicker } from '../src/components/avatar/AvatarCatalogPicker';
import { I18nProvider, translations } from '../src/i18n/context';
import { Language } from '../src/i18n/types';
import { AvatarCatalogItem, DEFAULT_STARTER_AVATAR } from '../src/api/types';
import { DEFAULT_AVATAR_COLORS, UserAvatarColors } from '../src/engine/avatar/avatarBuilder';

// renderToString reads zustand's initial-state snapshot, so the store is stubbed here;
// real store behavior is covered by avatar_engine.test.ts
const avatarStoreMock = vi.hoisted(() => ({
  state: {
    avatar: null as Record<string, unknown> | null,
    catalog: [] as unknown[],
    isLoading: false,
    isSaving: false,
    error: null as string | null,
    load: () => Promise.resolve(),
    save: () => Promise.resolve(true),
    resetToStarter: () => Promise.resolve(true)
  }
}));

vi.mock('../src/store/useAvatarStore', () => ({
  useAvatarStore: (selector: (state: typeof avatarStoreMock.state) => unknown) =>
    selector(avatarStoreMock.state)
}));

const ROOT = path.resolve(__dirname, '..');
const copy = translations.th.avatarEditor;

const AVATAR_FILES = [
  'src/components/avatar/AvatarEditorModal.tsx',
  'src/components/avatar/AvatarPreviewCanvas.tsx',
  'src/components/avatar/AvatarColorControls.tsx',
  'src/components/avatar/AvatarCatalogPicker.tsx',
  'src/engine/avatar/avatarAccessories.ts',
  'src/engine/avatar/avatarBuilder.ts',
  'src/engine/avatar/playerAvatar.ts',
  'src/store/useAvatarStore.ts',
  'src/api/avatars.ts',
  'src/components/Sidebar.tsx',
  'src/components/PlayerViewport.tsx'
];

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
const LEGACY_BRAND_REGEX = /roblox|rbx/i;

const CATALOG: AvatarCatalogItem[] = [
  { id: 'hat_crown_royal', kind: 'hat', name: 'Royal Crown', style: 'crown', color: '#fbbf24' },
  { id: 'hat_halo_neon', kind: 'hat', name: 'Neon Halo', style: 'halo', color: '#a3e635' },
  { id: 'shirt_vest_tech', kind: 'shirt', name: 'Tech Vest', style: 'vest', color: '#0ea5e9' }
];

const DRAFT: UserAvatarColors = { ...DEFAULT_AVATAR_COLORS, hatId: '', shirtId: '' };

function render(element: React.ReactElement): string {
  return renderToString(<I18nProvider>{element}</I18nProvider>);
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) || []).length;
}

describe('Avatar editor UI', () => {
  beforeEach(() => {
    Object.assign(avatarStoreMock.state, {
      avatar: null,
      catalog: CATALOG,
      isLoading: false,
      isSaving: false,
      error: null
    });
  });

  it('renders all six body parts with preset swatches and a custom color input', () => {
    const html = render(<AvatarColorControls colors={DRAFT} onChange={() => {}} />);
    for (const part of ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
      expect(html).toContain(copy[part]);
    }
    expect(count(html, /type="color"/g)).toBe(6);
    expect(count(html, /aria-pressed=/g)).toBe(48);
    expect(html).toContain('data-testid="avatar-color-controls"');
  });

  it('expands shorthand hex so the native color input receives a valid value', () => {
    const html = render(
      <AvatarColorControls colors={{ ...DRAFT, headColor: '#abc' }} onChange={() => {}} />
    );
    expect(html).toContain('#aabbcc');
    expect(html).not.toContain('value="#abc"');
  });

  it('lists the none option plus only accessories matching the requested kind', () => {
    const html = render(
      <AvatarCatalogPicker kind="hat" items={CATALOG} selectedId="" onSelect={() => {}} />
    );
    expect(html).toContain(copy.none);
    expect(html).toContain(copy.hats);
    expect(html).toContain('Royal Crown');
    expect(html).toContain('Neon Halo');
    expect(html).not.toContain('Tech Vest');
    expect(count(html, /<button/g)).toBe(3);
  });

  it('marks the equipped accessory and the none slot as pressed states', () => {
    const equipped = render(
      <AvatarCatalogPicker kind="hat" items={CATALOG} selectedId="hat_crown_royal" onSelect={() => {}} />
    );
    expect(count(equipped, /aria-pressed="true"/g)).toBe(1);

    const bare = render(
      <AvatarCatalogPicker kind="shirt" items={CATALOG} selectedId="" onSelect={() => {}} />
    );
    expect(count(bare, /aria-pressed="true"/g)).toBe(1);
    expect(bare).toContain(copy.shirts);
  });

  it('renders nothing while the editor is closed', () => {
    expect(render(<AvatarEditorModal isOpen={false} onClose={() => {}} />)).toBe('');
  });

  it('composes the preview, color controls, and both accessory sections when open', () => {
    const html = render(<AvatarEditorModal isOpen onClose={() => {}} />);
    expect(html).toContain(copy.title);
    expect(html).toContain(copy.subtitle);
    expect(html).toContain(copy.bodyColors);
    expect(html).toContain(copy.accessories);
    expect(html).toContain(copy.previewHint);
    expect(html).toContain(copy.save);
    expect(html).toContain(copy.reset);
    expect(html).toContain('data-testid="avatar-preview-canvas"');
    expect(html).toContain('data-testid="avatar-color-controls"');
    expect(html).toContain('data-testid="avatar-catalog-hat"');
    expect(html).toContain('data-testid="avatar-catalog-shirt"');
    expect(html).toContain('Royal Crown');
    expect(html).toContain('Tech Vest');
    expect(html).toContain(`aria-label="${copy.close}"`);
  });

  it('keeps the save action disabled until the draft diverges from the persisted avatar', () => {
    const html = render(<AvatarEditorModal isOpen onClose={() => {}} />);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain(copy.saved);
  });

  it('surfaces a store failure with a retry action', () => {
    avatarStoreMock.state.error = 'loadFailed';
    const html = render(<AvatarEditorModal isOpen onClose={() => {}} />);
    expect(html).toContain(copy.loadFailed);
    expect(html).toContain(copy.retry);
  });

  it('shows the loading veil while the first avatar fetch is in flight', () => {
    Object.assign(avatarStoreMock.state, { isLoading: true, avatar: null });
    const html = render(<AvatarEditorModal isOpen onClose={() => {}} />);
    expect(html).toContain(copy.loading);
  });
});

describe('Avatar entry point and player wiring', () => {
  it('wires the previously inert sidebar avatar button to the editor modal', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/components/Sidebar.tsx'), 'utf8');
    // The editor is code-split so three.js stays out of the initial bundle.
    expect(source).toContain("import('./avatar/AvatarEditorModal')");
    expect(source).toContain('setIsAvatarEditorOpen(true)');
    expect(source).toContain('<AvatarEditorModal isOpen={isAvatarEditorOpen}');
    expect(source).toMatch(/onClick=\{\(\) => setIsAvatarEditorOpen\(true\)\}[\s\S]{0,400}t\.nav\.avatar/);
  });

  it('builds the player rig from the persisted avatar rather than hardcoded defaults', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/components/PlayerViewport.tsx'), 'utf8');
    expect(source).toContain('bindPlayerAvatar()');
    expect(source).not.toContain('buildHumanoidAvatar(DEFAULT_AVATAR_COLORS)');
    expect(source).toContain('disposeAvatar()');
  });

  it('loads the avatar whenever the authenticated identity changes', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(source).toContain('useAvatarStore.getState().load()');
    expect(source).toMatch(/\}, \[user\?\.id\]\);/);
  });

  it('resolves accessories through the cloud catalog instead of a duplicated local list', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/api/avatars.ts'), 'utf8');
    expect(source).toContain('/api/v1/avatars/catalog');
    expect(source).toContain('export function resolveAvatarAccessories');
  });
});

describe('Avatar compliance invariants', () => {
  it('keeps every avatar source file within the 300 line SRP ceiling', () => {
    for (const relative of AVATAR_FILES) {
      const lines = fs.readFileSync(path.join(ROOT, relative), 'utf8').split('\n').length;
      expect(lines, `${relative} exceeds the SRP line ceiling`).toBeLessThanOrEqual(300);
    }
  });

  it('contains zero Unicode emojis and zero legacy platform brand strings', () => {
    for (const relative of AVATAR_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(EMOJI_REGEX.test(source), `${relative} contains an emoji`).toBe(false);
      expect(LEGACY_BRAND_REGEX.test(source), `${relative} contains a legacy brand`).toBe(false);
    }
  });

  it('keeps avatarEditor keys in parity over all four locales with non-empty values', () => {
    const reference = Object.keys(translations.en.avatarEditor).sort();
    expect(reference.length).toBeGreaterThan(15);
    for (const lang of ['th', 'en', 'ja', 'zh'] as Language[]) {
      const dict = translations[lang].avatarEditor;
      expect(Object.keys(dict).sort(), `${lang} avatarEditor key mismatch`).toEqual(reference);
      for (const key of reference) {
        const value = dict[key as keyof typeof dict];
        expect(typeof value).toBe('string');
        expect(value.trim().length, `${lang}.avatarEditor.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('ships starter colors that match the persisted starter avatar contract', () => {
    expect(DEFAULT_AVATAR_COLORS.headColor).toBe(DEFAULT_STARTER_AVATAR.headColor);
    expect(DEFAULT_AVATAR_COLORS.torsoColor).toBe(DEFAULT_STARTER_AVATAR.torsoColor);
    expect(DEFAULT_AVATAR_COLORS.leftLegColor).toBe(DEFAULT_STARTER_AVATAR.leftLegColor);
  });
});