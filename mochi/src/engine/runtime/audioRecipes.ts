// Built-in sound recipes. Data, not plumbing: the bus only knows how to route them.
//
// Every effect is synthesised, so an unknown sound name still produces something.

export interface RecipeSink {
  tone(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    delay?: number
  ): void;
  burst(duration: number, gainValue: number, cutoffHz: number): void;
}

export type Recipe = (sink: RecipeSink, gain: number) => void;

export function createRecipes(): Record<string, Recipe> {
  return {
      coin_pickup: (bus, gain) => {
        bus.tone(880, 1320, 0.1, 'square', gain * 0.5);
        bus.tone(1320, 1760, 0.12, 'square', gain * 0.36, 0.06);
      },
      jump_boost: (bus, gain) => {
        bus.tone(220, 880, 0.24, 'sawtooth', gain * 0.32);
      },
      hazard: (bus, gain) => {
        bus.burst(0.32, gain * 0.5, 900);
        bus.tone(180, 60, 0.3, 'sawtooth', gain * 0.34);
      },
      checkpoint: (bus, gain) => {
        bus.tone(660, 990, 0.16, 'triangle', gain * 0.4);
        bus.tone(990, 1320, 0.18, 'triangle', gain * 0.32, 0.09);
      },
      victory: (bus, gain) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
          bus.tone(freq, freq * 1.01, 0.18, 'triangle', gain * 0.36, index * 0.1);
        });
      },
      click: (bus, gain) => bus.tone(520, 760, 0.05, 'sine', gain * 0.3),
      ui_pop: (bus, gain) => bus.tone(640, 900, 0.06, 'sine', gain * 0.28),
      hit: (bus, gain) => bus.burst(0.12, gain * 0.45, 1800),
      swoosh: (bus, gain) => bus.tone(300, 120, 0.18, 'sine', gain * 0.26)
    };;
}
