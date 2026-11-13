// Uploaded audio: source classification, the decode cache, and routing.

import { describe, expect, it, vi } from 'vitest';
import {
  classifySampleSource,
  createSampleLibrary,
  isAccessId,
  looksLikeSampleUrl,
  resolveSampleUrl
} from '../src/engine/runtime/sampleLibrary';
import { routeSound, type SoundSink } from '../src/engine/runtime/audioRouting';

const ACCESS_ID = 'acc_0123456789abcdef0123';

const fakeBuffer = () => ({ duration: 1 }) as unknown as AudioBuffer;

describe('classifySampleSource', () => {
  it('recognises an access id, a URL and a recipe name', () => {
    expect(classifySampleSource(ACCESS_ID)).toBe('access-id');
    expect(classifySampleSource('https://cdn.example.com/hit.mp3')).toBe('url');
    expect(classifySampleSource('/assets/hit.wav')).toBe('url');
    expect(classifySampleSource('data:audio/wav;base64,AAAA')).toBe('url');
    expect(classifySampleSource('coin_pickup')).toBe('recipe');
    expect(classifySampleSource('hit')).toBe('recipe');
    expect(classifySampleSource('')).toBe('recipe');
  });

  it('only treats well-formed ids as access ids', () => {
    expect(isAccessId(ACCESS_ID)).toBe(true);
    expect(isAccessId('acc_short')).toBe(false);
    expect(isAccessId('ACC_0123456789abcdef0123')).toBe(false);
    expect(isAccessId('acc_0123456789ABCDEF0123')).toBe(false);
  });

  it('keeps the boolean helper in step', () => {
    expect(looksLikeSampleUrl(ACCESS_ID)).toBe(true);
    expect(looksLikeSampleUrl('hit')).toBe(false);
  });
});

describe('resolveSampleUrl', () => {
  it('passes a URL through without calling the resolver', async () => {
    const resolve = vi.fn(async () => 'https://cdn/x.mp3');
    await expect(resolveSampleUrl('https://cdn/x.mp3', resolve)).resolves.toBe('https://cdn/x.mp3');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('resolves an access id', async () => {
    const resolve = vi.fn(async () => 'https://cdn/resolved.mp3');
    await expect(resolveSampleUrl(ACCESS_ID, resolve)).resolves.toBe('https://cdn/resolved.mp3');
    expect(resolve).toHaveBeenCalledWith(ACCESS_ID);
  });

  it('returns null when the service refuses', async () => {
    await expect(resolveSampleUrl(ACCESS_ID, async () => null)).resolves.toBeNull();
    await expect(resolveSampleUrl('', async () => 'x')).resolves.toBeNull();
  });
});

describe('createSampleLibrary', () => {
  it('decodes once and shares the result', async () => {
    const decode = vi.fn(async () => fakeBuffer());
    const library = createSampleLibrary({ decode });

    const [first, second] = await Promise.all([
      library.load('https://cdn/a.mp3'),
      library.load('https://cdn/a.mp3')
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(library.state('https://cdn/a.mp3')).toBe('ready');
    expect(library.peek('https://cdn/a.mp3')).not.toBeNull();
  });

  it('resolves an access id before decoding', async () => {
    const decode = vi.fn(async () => fakeBuffer());
    const resolve = vi.fn(async () => 'https://cdn/resolved.mp3');
    const library = createSampleLibrary({ decode, resolve });

    await library.load(ACCESS_ID);

    expect(resolve).toHaveBeenCalledWith(ACCESS_ID);
    expect(decode).toHaveBeenCalledWith('https://cdn/resolved.mp3');
    // The cache is keyed by what the creator wrote, not by the resolved URL.
    expect(library.state(ACCESS_ID)).toBe('ready');
  });

  it('marks an unresolvable id as failed without decoding', async () => {
    const decode = vi.fn(async () => fakeBuffer());
    const library = createSampleLibrary({ decode, resolve: async () => null });

    await expect(library.load(ACCESS_ID)).resolves.toBe(false);
    expect(decode).not.toHaveBeenCalled();
    expect(library.state(ACCESS_ID)).toBe('failed');
  });

  it('marks a decode failure and allows a retry after forget', async () => {
    let attempt = 0;
    const library = createSampleLibrary({
      decode: async () => {
        attempt += 1;
        return attempt === 1 ? null : fakeBuffer();
      }
    });

    await expect(library.load('https://cdn/b.mp3')).resolves.toBe(false);
    expect(library.state('https://cdn/b.mp3')).toBe('failed');

    library.forget('https://cdn/b.mp3');
    await expect(library.load('https://cdn/b.mp3')).resolves.toBe(true);
    expect(attempt).toBe(2);
  });

  it('never starts work from peek', () => {
    const decode = vi.fn(async () => fakeBuffer());
    const library = createSampleLibrary({ decode });

    expect(library.peek('https://cdn/c.mp3')).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it('evicts the oldest idle entry once capacity is reached', async () => {
    const library = createSampleLibrary({ decode: async () => fakeBuffer(), capacity: 2 });

    await library.load('a');
    await library.load('b');
    await library.load('c');

    expect(library.size()).toBe(2);
    expect(library.state('a')).toBe('idle');
    expect(library.state('c')).toBe('ready');
  });
});

describe('routeSound', () => {
  function sink() {
    const calls: string[] = [];
    const target: SoundSink = {
      play: (name) => calls.push(`recipe:${name}`),
      playSample: (source) => {
        calls.push(`sample:${source}`);
        return true;
      }
    };
    return { target, calls };
  }

  it('sends a recipe name to the synthesiser', () => {
    const { target, calls } = sink();
    expect(routeSound(target, 'coin_pickup')).toBe('recipe');
    expect(calls).toEqual(['recipe:coin_pickup']);
  });

  it('sends an access id and a URL to the sample path', () => {
    const { target, calls } = sink();
    expect(routeSound(target, ACCESS_ID)).toBe('access-id');
    expect(routeSound(target, 'https://cdn/a.mp3')).toBe('url');
    expect(calls).toEqual([`sample:${ACCESS_ID}`, 'sample:https://cdn/a.mp3']);
  });

  it('passes the position through to whichever path it picks', () => {
    const positions: unknown[] = [];
    const target: SoundSink = {
      play: (_name, options) => positions.push(options.position),
      playSample: (_source, options) => {
        positions.push(options.position);
        return true;
      }
    };
    routeSound(target, 'hit', { x: 1, y: 2, z: 3 });
    routeSound(target, ACCESS_ID, { x: 4, y: 5, z: 6 });
    expect(positions).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 }
    ]);
  });
});
