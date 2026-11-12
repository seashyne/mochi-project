// Play mode contract: pressing Play replaces the builder canvas with the live
// runtime stage, and the stage exposes stop / restart / mute plus a play badge.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioPlaytestStage } from '../src/components/studio/StudioPlaytestStage';
import { StudioViewport } from '../src/pages/studio/StudioViewport';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import { part, plain } from './shellFixtures';

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const stage = (overrides: Partial<React.ComponentProps<typeof StudioPlaytestStage>> = {}) =>
  renderToString(
    <StudioPlaytestStage
      objects={[part()]}
      title="Neon Obby"
      onStop={vi.fn()}
      {...overrides}
    />
  );

const viewport = (play?: React.ComponentProps<typeof StudioViewport>['play']) =>
  renderToString(
    <StudioViewport
      view="builder"
      canvas={<canvas className="builder-canvas cursor-crosshair" />}
      objects={[part()]}
      animation={{ clips: [], replaceClips: vi.fn() } as never}
      script={{
        code: 'print(1)',
        onCodeChange: vi.fn(),
        logs: [],
        executionTimeMs: null,
        hasError: false,
        errorMessage: null,
        isTesting: false,
        clearLogs: vi.fn(),
        runTest: vi.fn()
      }}
      publish={{
        title: 'Neon Obby',
        slug: 'neon-obby',
        versionNumber: '1.0.0',
        description: '',
        notice: null,
        error: null,
        isPublishing: false,
        progress: null,
        onTitleChange: vi.fn(),
        onSlugChange: vi.fn(),
        onVersionChange: vi.fn(),
        onDescriptionChange: vi.fn(),
        onSubmit: vi.fn()
      }}
      play={play}
    />
  );

describe('Studio viewport play mode', () => {
  it('renders the builder canvas while nobody is playing', () => {
    const html = viewport();
    expect(html).toContain('cursor-crosshair');
    expect(html).not.toContain('Stop playtest');
  });

  it('hands the viewport to the runtime stage while playing', () => {
    const html = viewport({ objects: [part()], title: 'Neon Obby', onStop: vi.fn(), onLog: vi.fn() });
    expect(html).not.toContain('cursor-crosshair');
    expect(html).toContain('touch-none');
    expect(html).toContain('Stop playtest');
  });

  it('lets play mode win over the script tab', () => {
    const html = renderToString(
      <StudioViewport
        view="script"
        canvas={<canvas className="builder-canvas" />}
        objects={[part()]}
        animation={{ clips: [], replaceClips: vi.fn() } as never}
        script={{
          code: 'print(1)',
          onCodeChange: vi.fn(),
          logs: [],
          executionTimeMs: null,
          hasError: false,
          errorMessage: null,
          isTesting: false,
          clearLogs: vi.fn(),
          runTest: vi.fn()
        }}
        publish={{
          title: 'T', slug: 't', versionNumber: '1.0.0', description: '',
          notice: null, error: null, isPublishing: false, progress: null,
          onTitleChange: vi.fn(), onSlugChange: vi.fn(), onVersionChange: vi.fn(),
          onDescriptionChange: vi.fn(), onSubmit: vi.fn()
        }}
        play={{ objects: [part()], title: 'T', onStop: vi.fn(), onLog: vi.fn() }}
      />
    );
    expect(html).toContain('Stop playtest');
    expect(html).not.toContain('Run &amp; Test Script');
  });
});

describe('Studio playtest stage', () => {
  it('renders a canvas plus the play badge and stop control', () => {
    const html = stage();
    expect(html).toContain('<canvas');
    expect(html).toContain('touch-none');
    expect(plain(html)).toContain('Starting');
    expect(html).toContain('aria-label="Stop playtest"');
  });

  it('exposes mute and restart controls', () => {
    const html = stage();
    expect(html).toContain('aria-label="Mute"');
    expect(html).toContain('aria-label="Restart session"');
  });

  it('keeps the overlay tokens and ships no emoji', () => {
    const html = stage();
    expect(html).toContain('bg-studio-panel/90');
    expect(html).toContain('border-studio-success/40');
    expect(EMOJI_REGEX.test(html)).toBe(false);
  });
});
