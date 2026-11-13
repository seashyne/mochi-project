// Procedural WebAudio sound bus. No audio assets ship with the editor, so every
// named effect is synthesised on the fly — `world.playSound("anything")` always
// produces something, and known names get hand-tuned recipes.

import { RuntimeVec3 } from './types';
import {
  MAX_AUDIBLE_DISTANCE,
  attenuationGain,
  distance3d,
  dopplerRatio,
  panFor,
  ratioToCents,
  type SpatialListener
} from './audioSpatial';

export type AudioBusName = 'sfx' | 'music';

export interface PlayOptions {
  position?: RuntimeVec3;
  /** Source velocity, for Doppler. Ignored without a position. */
  velocity?: RuntimeVec3;
  volume?: number;
  bus?: AudioBusName;
}

type Recipe = (bus: AudioBus, gain: number) => void;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AudioBusName, GainNode>> = {};
  private readonly busLevels: Record<AudioBusName, number> = { sfx: 1, music: 1 };
  private readonly busMuted: Record<AudioBusName, boolean> = { sfx: false, music: false };
  private noiseBuffer: AudioBuffer | null = null;
  private listener: SpatialListener = { x: 0, y: 0, z: 0, yaw: 0 };
  private volume = 0.65;
  private muted = false;
  private recipes: Record<string, Recipe> = {};
  /** Sink for the recipe being rendered right now: a panner, or the bus itself. */
  private output: AudioNode | null = null;
  private detuneCents = 0;

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
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.buses = {};
      for (const name of ['sfx', 'music'] as AudioBusName[]) {
        const busGain = this.ctx.createGain();
        busGain.gain.value = this.busMuted[name] ? 0 : this.busLevels[name];
        busGain.connect(this.master);
        this.buses[name] = busGain;
      }
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

  /** Listener position, and the yaw that decides left from right. */
  setListener(position: RuntimeVec3, yaw = this.listener.yaw): void {
    this.listener = { x: position.x, y: position.y, z: position.z, yaw };
  }

  /** Per-bus level, 0..1. Music and effects are mixed independently. */
  setBusVolume(bus: AudioBusName, volume: number): void {
    this.busLevels[bus] = Math.max(0, Math.min(1, volume));
    this.applyBusGain(bus);
  }

  setBusMuted(bus: AudioBusName, muted: boolean): void {
    this.busMuted[bus] = Boolean(muted);
    this.applyBusGain(bus);
  }

  busVolume(bus: AudioBusName): number {
    return this.busLevels[bus];
  }

  private applyBusGain(bus: AudioBusName): void {
    const node = this.buses[bus];
    if (!node) return;
    node.gain.value = this.busMuted[bus] ? 0 : this.busLevels[bus];
  }

  private busNode(bus: AudioBusName): AudioNode | null {
    return this.buses[bus] ?? this.master;
  }

  /** Plays a named effect, attenuated, panned and pitch-shifted by its position. */
  play(name: string, options: PlayOptions = {}): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.master) return;

    const busName = options.bus ?? 'sfx';
    const busNode = this.busNode(busName);
    if (!busNode) return;

    let gain = options.volume ?? 1;
    let pan = 0;
    let detune = 0;

    if (options.position) {
      const distance = distance3d(this.listener, options.position);
      if (distance >= MAX_AUDIBLE_DISTANCE) return;
      gain *= attenuationGain(distance);
      pan = panFor(this.listener, options.position);
      if (options.velocity) {
        detune = ratioToCents(dopplerRatio(this.listener, options.position, options.velocity));
      }
    }

    const sink = pan === 0 ? busNode : this.createPanner(pan, busNode);
    this.output = sink;
    this.detuneCents = detune;

    try {
      const key = String(name ?? '')
        .toLowerCase()
        .replace(/[\s-]/g, '_');
      const recipe = this.recipes[key];
      const level = Math.max(0.02, Math.min(1, gain));
      if (recipe) {
        recipe(this, level);
        return;
      }
      // Unknown sound name: a soft neutral blip so scripts still get feedback.
      this.tone(440, 660, 0.1, 'sine', level * 0.3);
    } finally {
      this.output = null;
      this.detuneCents = 0;
    }
  }

  private createPanner(pan: number, destination: AudioNode): AudioNode {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.createStereoPanner !== 'function') return destination;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(destination);
    return panner;
  }

  private sink(): AudioNode | null {
    return this.output ?? this.busNode('sfx');
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
    const destination = this.sink();
    if (!ctx || !destination) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    // Doppler, when the caller supplied a velocity.
    if (this.detuneCents !== 0) osc.detune.setValueAtTime(this.detuneCents, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /** Internal: filtered noise burst used for impacts and hazards. */
  burst(duration: number, gainValue: number, cutoffHz: number): void {
    const ctx = this.ctx;
    const destination = this.sink();
    if (!ctx || !destination || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(destination);
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
