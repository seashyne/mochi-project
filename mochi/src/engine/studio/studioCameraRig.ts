// Orbit / pan / fly camera rig for the editor viewport. Pure maths on a
// PerspectiveCamera, so it can be unit-tested without a renderer or DOM.

import * as THREE from 'three';

export type ViewPreset = 'top' | 'front' | 'right' | 'iso';

export const VIEW_PRESETS: ViewPreset[] = ['iso', 'top', 'front', 'right'];

export interface CameraRigState {
  phi: number;
  theta: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);

export class StudioCameraRig {
  private phi = Math.PI / 4;
  private theta = Math.PI / 4;
  private radius = 22;
  private readonly keys = new Set<string>();
  private flySpeed = 12;
  readonly target = new THREE.Vector3(0, 2, 0);

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.update();
  }

  getState(): CameraRigState {
    return {
      phi: this.phi,
      theta: this.theta,
      radius: this.radius,
      target: { x: this.target.x, y: this.target.y, z: this.target.z }
    };
  }

  orbit(dx: number, dy: number): void {
    this.theta -= dx * 0.008;
    this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - dy * 0.008));
    this.update();
  }

  zoom(deltaY: number): void {
    this.radius = Math.max(2, Math.min(200, this.radius + deltaY * 0.03));
    this.update();
  }

  pan(dx: number, dy: number): void {
    const scale = this.radius * 0.0018;
    const rightX = Math.cos(this.theta);
    const rightZ = -Math.sin(this.theta);
    this.target.x += -dx * rightX * scale;
    this.target.z += -dx * rightZ * scale;
    this.target.y += dy * scale;
    this.update();
  }

  focus(point: { x: number; y: number; z: number }, radius?: number): void {
    this.target.set(point.x, point.y, point.z);
    if (radius !== undefined) {
      this.radius = Math.max(3, Math.min(120, radius));
    }
    this.update();
  }

  setView(preset: ViewPreset): void {
    if (preset === 'top') { this.phi = 0.12; this.theta = 0; }
    else if (preset === 'front') { this.phi = Math.PI / 2 - 0.06; this.theta = 0; }
    else if (preset === 'right') { this.phi = Math.PI / 2 - 0.06; this.theta = Math.PI / 2; }
    else { this.phi = Math.PI / 4; this.theta = Math.PI / 4; }
    this.update();
  }

  setKey(key: string, down: boolean): void {
    const normalized = key.toLowerCase();
    if (!FLY_KEYS.has(normalized)) return;
    if (down) this.keys.add(normalized);
    else this.keys.delete(normalized);
  }

  clearKeys(): void {
    this.keys.clear();
  }

  /** Called once per rendered frame while fly mode is enabled. */
  advance(dt: number): void {
    if (this.keys.size === 0) return;
    const step = Math.min(Math.max(dt, 0), 0.1) * this.flySpeed;
    const forwardX = -Math.sin(this.theta);
    const forwardZ = -Math.cos(this.theta);
    const rightX = Math.cos(this.theta);
    const rightZ = -Math.sin(this.theta);
    const move = (axis: number, fx: number, fz: number) => {
      this.target.x += axis * fx * step;
      this.target.z += axis * fz * step;
    };
    if (this.keys.has('w')) move(1, forwardX, forwardZ);
    if (this.keys.has('s')) move(-1, forwardX, forwardZ);
    if (this.keys.has('d')) move(1, rightX, rightZ);
    if (this.keys.has('a')) move(-1, rightX, rightZ);
    if (this.keys.has('e')) this.target.y += step;
    if (this.keys.has('q')) this.target.y -= step;
    this.update();
  }

  update(): void {
    const sinPhi = Math.sin(this.phi);
    this.camera.position.x = this.target.x + this.radius * sinPhi * Math.sin(this.theta);
    this.camera.position.y = this.target.y + this.radius * Math.cos(this.phi);
    this.camera.position.z = this.target.z + this.radius * sinPhi * Math.cos(this.theta);
    this.camera.lookAt(this.target);
  }
}
