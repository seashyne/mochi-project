// Rolling FPS / frame-time meter with subscriber fan-out.
// Extracted from RuntimeEngine so the loop stays within the SRP line ceiling.

export type FpsCallback = (fps: number, frameTimeMs: number) => void;

const SAMPLE_WINDOW = 30;

export class FpsMeter {
  public fps = 60;
  public frameTimeMs = 16.6;
  private samples: number[] = [];
  private readonly callbacks = new Set<FpsCallback>();

  subscribe(callback: FpsCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  clear(): void {
    this.callbacks.clear();
    this.samples.length = 0;
  }

  /** Feeds one frame delta and notifies every subscriber with the smoothed value. */
  sample(deltaSec: number): void {
    if (deltaSec <= 0) return;
    this.samples.push(1 / deltaSec);
    if (this.samples.length > SAMPLE_WINDOW) this.samples.shift();

    const sum = this.samples.reduce((total, value) => total + value, 0);
    this.fps = Math.round(sum / this.samples.length);
    this.frameTimeMs = parseFloat((deltaSec * 1000).toFixed(1));

    for (const callback of this.callbacks) {
      callback(this.fps, this.frameTimeMs);
    }
  }
}
