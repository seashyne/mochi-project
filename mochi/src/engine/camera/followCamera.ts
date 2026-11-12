// Smooth Third-Person Follow Camera with spherical orbit, spring dampening, and yaw tracking
// Calculates camera positions relative to player character and provides camera-relative vectors

import * as THREE from 'three';

export interface FollowCameraConfig {
  target?: { x: number; y: number; z: number };
  radius?: number;
  minRadius?: number;
  maxRadius?: number;
  theta?: number;
  phi?: number;
  minPhi?: number;
  maxPhi?: number;
  smoothSpeed?: number;
  sensitivity?: number;
  heightOffset?: number;
}

export class FollowCamera {
  public target: THREE.Vector3;
  public currentPosition: THREE.Vector3;
  public radius: number;
  public minRadius: number;
  public maxRadius: number;
  public theta: number; // Yaw angle in radians
  public phi: number; // Pitch angle in radians
  public minPhi: number;
  public maxPhi: number;
  public smoothSpeed: number;
  public sensitivity: number;
  public heightOffset: number;

  private isInitialized = false;

  constructor(config?: FollowCameraConfig) {
    this.target = new THREE.Vector3(
      config?.target?.x ?? 0,
      config?.target?.y ?? 1.0,
      config?.target?.z ?? 0
    );
    this.radius = config?.radius ?? 6.0;
    this.minRadius = config?.minRadius ?? 2.0;
    this.maxRadius = config?.maxRadius ?? 20.0;
    this.theta = config?.theta ?? 0;
    this.phi = config?.phi ?? Math.PI / 4;
    this.minPhi = config?.minPhi ?? 0.1;
    this.maxPhi = config?.maxPhi ?? Math.PI / 2 - 0.05;
    this.smoothSpeed = config?.smoothSpeed ?? 10.0;
    this.sensitivity = config?.sensitivity ?? 0.005;
    this.heightOffset = config?.heightOffset ?? 1.2;

    this.currentPosition = new THREE.Vector3(
      this.target.x,
      this.target.y + this.heightOffset + this.radius * Math.cos(this.phi),
      this.target.z - this.radius * Math.sin(this.phi)
    );
  }

  public setTarget(target: { x: number; y: number; z: number }): void {
    this.target.set(target.x, target.y, target.z);
    if (!this.isInitialized) {
      this.teleportToTarget();
      this.isInitialized = true;
    }
  }

  public orbit(deltaX: number, deltaY: number): void {
    this.theta += deltaX * this.sensitivity;
    this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi + deltaY * this.sensitivity));
  }

  public zoom(deltaZoom: number): void {
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius + deltaZoom));
  }

  public getYaw(): number {
    return this.theta;
  }

  public getPitch(): number {
    return this.phi;
  }

  public getRadius(): number {
    return this.radius;
  }

  public getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.theta), 0, Math.cos(this.theta)).normalize();
  }

  public getRightVector(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta)).normalize();
  }

  public teleportToTarget(): void {
    const centerY = this.target.y + this.heightOffset;
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);

    this.currentPosition.set(
      this.target.x - this.radius * sinPhi * Math.sin(this.theta),
      centerY + this.radius * cosPhi,
      this.target.z - this.radius * sinPhi * Math.cos(this.theta)
    );
  }

  public update(camera: THREE.PerspectiveCamera, dt: number): void {
    const centerY = this.target.y + this.heightOffset;
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);

    const desiredX = this.target.x - this.radius * sinPhi * Math.sin(this.theta);
    const desiredY = centerY + this.radius * cosPhi;
    const desiredZ = this.target.z - this.radius * sinPhi * Math.cos(this.theta);

    const lerpRate = Math.min(1.0, Math.max(0.001, this.smoothSpeed * dt));
    this.currentPosition.x += (desiredX - this.currentPosition.x) * lerpRate;
    this.currentPosition.y += (desiredY - this.currentPosition.y) * lerpRate;
    this.currentPosition.z += (desiredZ - this.currentPosition.z) * lerpRate;

    camera.position.copy(this.currentPosition);
    camera.lookAt(this.target.x, centerY, this.target.z);
  }

  public reset(theta = 0, phi = Math.PI / 4, radius = 6.0): void {
    this.theta = theta;
    this.phi = phi;
    this.radius = radius;
    this.teleportToTarget();
  }
}
