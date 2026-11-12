// Pooled GPU point emitter for Studio Particle objects. One Points draw call per
// emitter, no per-frame allocations, and deterministic-enough behaviour for tests.

import * as THREE from 'three';
import type { ParticleDef } from './advancedTypes';
import type { StudioObject } from './types';

const MAX_PARTICLES = 2000;
const HIDDEN_Y = -100000;

export class ParticleEmitter {
  readonly objectId: string;
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseColor: THREE.Color;
  private readonly capacity: number;
  private readonly def: ParticleDef;
  private readonly origin: THREE.Vector3;
  private accumulator = 0;
  private cursor = 0;
  private seed = 1;

  constructor(
    obj: StudioObject,
    def: ParticleDef,
    private readonly scene: THREE.Scene
  ) {
    this.objectId = obj.id;
    this.def = def;
    this.baseColor = new THREE.Color(def.color);
    this.origin = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
    this.capacity = Math.min(MAX_PARTICLES, Math.max(1, Math.ceil(def.rate * def.lifetime) + 8));
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) this.positions[i * 3 + 1] = HIDDEN_Y;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: def.size,
      vertexColors: true,
      transparent: true,
      opacity: def.shape === 'spark' ? 0.9 : 0.55,
      depthWrite: false,
      sizeAttenuation: true,
      blending: def.shape === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.name = `particles_${obj.id}`;
    this.scene.add(this.points);
  }

  /** Small deterministic PRNG keeps replay/testing reproducible. */
  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private spawn(): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const p = i * 3;
    this.positions[p] = this.origin.x + (this.random() - 0.5) * 0.3;
    this.positions[p + 1] = this.origin.y;
    this.positions[p + 2] = this.origin.z + (this.random() - 0.5) * 0.3;
    const spread = this.def.spread;
    this.velocities[p] = (this.random() - 0.5) * spread * this.def.speed;
    this.velocities[p + 1] = this.def.speed * (0.6 + this.random() * 0.6);
    this.velocities[p + 2] = (this.random() - 0.5) * spread * this.def.speed;
    this.life[i] = this.def.lifetime;
    this.maxLife[i] = this.def.lifetime;
  }

  update(dt: number): void {
    if (!this.def.enabled) return;
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.accumulator += this.def.rate * step;
    while (this.accumulator >= 1) {
      this.spawn();
      this.accumulator -= 1;
    }

    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= step;
      const p = i * 3;
      if (this.life[i] <= 0) {
        this.positions[p + 1] = HIDDEN_Y;
        this.colors[p] = 0;
        this.colors[p + 1] = 0;
        this.colors[p + 2] = 0;
        continue;
      }
      this.velocities[p + 1] += this.def.gravity * step;
      this.positions[p] += this.velocities[p] * step;
      this.positions[p + 1] += this.velocities[p + 1] * step;
      this.positions[p + 2] += this.velocities[p + 2] * step;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[p] = this.baseColor.r * fade;
      this.colors[p + 1] = this.baseColor.g * fade;
      this.colors[p + 2] = this.baseColor.b * fade;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  get particleCount(): number {
    return this.capacity;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
