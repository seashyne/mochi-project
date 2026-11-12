// Animation editor UI: panel structure, timeline rendering, locale coverage,
// animatable-target rules and publish/draft manifest passthrough.

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { StudioAnimationEditor } from '../src/components/studio/StudioAnimationEditor';
import { AnimationTimeline } from '../src/components/studio/AnimationTimeline';
import { isAnimatableObject, type StudioAnimationsApi } from '../src/components/studio/useStudioAnimations';
import type { MochiAnimationClip } from '../src/engine/animation/clip';
import type { StudioObject } from '../src/engine/studio/types';
import { buildPublishManifest } from '../src/engine/package/publishWorld';
import { StudioDraftsApi } from '../src/api/studioDrafts';
import type { ApiClient } from '../src/api/client';

const clip: MochiAnimationClip = {
  id: 'c1', name: 'Wave', duration: 2, loop: true,
  tracks: [{
    target: 'arm',
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 } },
      { time: 1, position: { x: 5, y: 0, z: 0 }, easing: 'step' },
      { time: 2, position: { x: 0, y: 0, z: 0 } }
    ]
  }]
};

const object: StudioObject = {
  id: 'arm', name: 'Robot Arm', type: 'model',
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#fff'
};

function api(overrides: Partial<StudioAnimationsApi> = {}): StudioAnimationsApi {
  return {
    clips: [clip], selectedClipId: 'c1', selectedClip: clip, playhead: 0.5, isPlaying: false,
    selectClip: vi.fn(), createClip: vi.fn(), deleteClip: vi.fn(), updateClip: vi.fn(),
    replaceClips: vi.fn(), addTrack: vi.fn(), removeTrack: vi.fn(), captureKeyframe: vi.fn(),
    deleteKeyframe: vi.fn(), setKeyframeEasing: vi.fn(), seek: vi.fn(), play: vi.fn(), pause: vi.fn(), stop: vi.fn(),
    ...overrides
  };
}

const render = (ui: React.ReactElement, locale: 'en' | 'th' = 'en') =>
  renderToString(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>);

describe('StudioAnimationEditor', () => {
  it('shows the empty state without clips', () => {
    const html = render(<StudioAnimationEditor api={api({ clips: [], selectedClip: null, selectedClipId: null })} objects={[object]} />);
    expect(html).toContain('No clips yet');
    expect(html).toContain('animation-new-clip');
  });

  it('renders clip settings, transport, tracks and keyframes', () => {
    const html = render(<StudioAnimationEditor api={api()} objects={[object]} />);
    expect(html).toContain('value="Wave"');
    expect(html).toContain('animation-play-pause');
    expect(html).toContain('animation-stop');
    expect(html).toContain('Robot Arm');
    expect(html).toContain('animation-capture-arm');
    expect(html).toContain('animation-delete-key-arm-1');
    expect(html).toContain('0.50');
    expect(html).toContain('2.00');
    expect(html).toContain('animation-timeline');
  });

  it('localizes into Thai', () => {
    const html = render(<StudioAnimationEditor api={api()} objects={[object]} />, 'th');
    expect(html).toContain('ตัวแก้ไขแอนิเมชัน');
    expect(html).toContain('บันทึกคีย์เฟรม');
  });
});

describe('AnimationTimeline', () => {
  it('positions keyframes and the playhead by time ratio', () => {
    const html = render(
      <AnimationTimeline clip={clip} playhead={1} onSeek={vi.fn()} onDeleteKeyframe={vi.fn()} />
    );
    expect(html).toContain('left:50%');
    expect(html).toContain('keyframe-arm-0');
    expect(html).toContain('keyframe-arm-1');
    expect(html).toContain('keyframe-arm-2');
    expect(html).toContain('animation-playhead');
  });

  it('renders an empty row when the clip has no tracks', () => {
    const html = render(
      <AnimationTimeline clip={{ ...clip, tracks: [] }} playhead={0} onSeek={vi.fn()} onDeleteKeyframe={vi.fn()} />
    );
    expect(html).toContain('animation-timeline-area');
  });
});

describe('animatable targets', () => {
  it('allows models and scripted objects, rejects batched primitives and markers', () => {
    expect(isAnimatableObject(object)).toBe(true);
    expect(isAnimatableObject({ ...object, type: 'block', luaScript: '-- move' })).toBe(true);
    expect(isAnimatableObject({ ...object, type: 'block', luaScript: undefined })).toBe(false);
    expect(isAnimatableObject({ ...object, type: 'coin' })).toBe(false);
    expect(isAnimatableObject({ ...object, type: 'constraint' })).toBe(false);
    expect(isAnimatableObject({ ...object, type: 'terrain' })).toBe(true);
  });
});

describe('animation persistence', () => {
  it('includes clips in the inline publish manifest', async () => {
    const manifestJson = await buildPublishManifest({
      title: 'Anim World', version: '1.0.0', objects: [object], animations: [clip]
    });
    expect(JSON.parse(manifestJson).animations).toEqual([clip]);
  });

  it('omits animations when none exist', async () => {
    const manifestJson = await buildPublishManifest({ title: 'T', version: '1.0.0', objects: [object] });
    expect(JSON.parse(manifestJson).animations).toBeUndefined();
  });

  it('saves clips inside the draft manifest', async () => {
    const post = vi.fn(async () => ({ draft: {} }));
    const client = { post } as unknown as ApiClient;
    const drafts = new StudioDraftsApi(client);
    await drafts.save({ title: 'T', objects: [object], scriptCode: '', animations: [clip] }, 'token');
    const body = post.mock.calls[0][1] as { manifestJson: string };
    expect(JSON.parse(body.manifestJson).animations).toEqual([clip]);
  });
});