// Decides whether a `world.playSound` argument is a built-in recipe or an uploaded
// sample, and hands it to the right path. Kept separate from the Lua proxy so the
// routing can be tested without a WebAudio context.

import type { RuntimeVec3 } from './types';
import { classifySampleSource, type SampleSource } from './sampleLibrary';

export interface SoundSink {
  play(name: string, options: { position?: RuntimeVec3 }): void;
  playSample(url: string, options: { position?: RuntimeVec3 }): boolean;
}

export type SoundRoute = SampleSource;

/**
 * Routes a `world.playSound` argument: an access id or a URL is a file, anything
 * else is a recipe. The sink owns resolution, so an id never needs the Lua layer to
 * know how the asset service works.
 */
export function routeSound(sink: SoundSink, name: string, position?: RuntimeVec3): SoundRoute {
  const route = classifySampleSource(name);
  if (route === 'recipe') {
    sink.play(name, { position });
    return 'recipe';
  }
  sink.playSample(name, { position });
  return route;
}
