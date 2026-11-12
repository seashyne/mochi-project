// Procedural WebAudio sound bus. No audio assets ship with the editor, so every
// named effect is synthesised on the fly — `world.playSound("anything")` always
// produces something, and known names get hand-tuned recipes.

import { RuntimeVec3 } from './types';

const MAX_AUDIBLE_DISTANCE = 34;

type Recipe = (bus: AudioBus, gain: number) => void;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listener: RuntimeVec3 = { x: 0, y: 0, z: 0 };
  private volume = 0.65;
  private muted = false;
  private recipes: Record<string, Recipe> = {};

  constructor() {
    this.recipes = {
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
    };
  }

  /** Must be called from a user gesture before the first sound can play. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  setListener(position: RuntimeVec3): void {
    this.listener = { x: position.x, y: position.y, z: position.z };
  }

  /** Plays a named effect, attenuated by distance from the listener when positioned. */
  play(name: string, options: { position?: RuntimeVec3; volume?: number } = {}): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.master) return;

    let gain = options.volume ?? 1;
    if (options.position) {
      const dx = options.position.x - this.listener.x;
      const dy = options.position.y - this.listener.y;
      const dz = options.position.z - this.listener.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > MAX_AUDIBLE_DISTANCE) return;
      gain *= Math.max(0.05, 1 - distance / MAX_AUDIBLE_DISTANCE);
    }

    const key = String(name ?? '')
      .toLowerCase()
      .replace(/[\s-]/g, '_');
    const recipe = this.recipes[key];
    if (recipe) {
      recipe(this, Math.max(0.02, Math.min(1, gain)));
      return;
    }
    // Unknown sound name: a soft neutral blip so scripts still get audible feedback.
    this.tone(440, 660, 0.1, 'sine', Math.max(0.02, Math.min(1, gain)) * 0.3);
  }

  /** Internal: shaped oscillator sweep used by the recipes. */
  tone(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    delay = 0
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /** Internal: filtered noise burst used for impacts and hazards. */
  burst(duration: number, gainValue: number, cutoffHz: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
    source.stop(start + duration);
  }

  dispose(): void {
    this.master?.disconnect();
    this.noiseBuffer = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return buffer;
  }
}
