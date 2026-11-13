// Three.js WebGL2 3D Game Runtime Engine with fixed 60Hz physics and 120Hz display interpolation

import * as THREE from 'three';
import { MultiplayerManager } from './multiplayerManager';
import { PhysicsWorld } from './physics';
import { FollowCamera } from './camera/followCamera';
import { configureModelLoader } from './assets/modelLoader';
import { buildShowcaseScene } from './scene/showcaseScene';
import { updateDistanceCulling } from './scene/distanceCulling';
import { updateOcclusionCulling } from './scene/occlusionCulling';
import { RenderDiagnostics } from './scene/renderBudget';
import { FpsMeter } from './scene/fpsMeter';
import { detectRendererCapabilities, type RendererCapabilities } from './rendererCapabilities';

export type { FpsCallback } from './scene/fpsMeter';

export interface EngineState {
  isRunning: boolean;
  isPaused: boolean;
  fps: number;
  frameTimeMs: number;
}

export class RuntimeEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private followCamera: FollowCamera | null = null;

  // Scene objects
  private centralMesh: THREE.Mesh | null = null;
  private orbitingMesh: THREE.Mesh | null = null;
  private dynamicLight: THREE.PointLight | null = null;
  private multiplayerManager: MultiplayerManager | null = null;
  private physicsWorld: PhysicsWorld = new PhysicsWorld();
  public readonly renderDiagnostics = new RenderDiagnostics();

  // Animation and physics state
  private isRunning = false;
  private isPaused = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private readonly FIXED_STEP = 1 / 60; // 60Hz physics tick

  // Physics state variables
  private simTime = 0;
  private primaryRotation = new THREE.Euler(0, 0, 0);
  private orbitAngle = 0;

  // Interpolated rendering state
  private prevRotation = new THREE.Euler(0, 0, 0);
  private prevOrbitAngle = 0;

  // FPS and performance monitoring
  private readonly fpsMeter = new FpsMeter();
  private capabilities: RendererCapabilities | null = null;
  private beforePhysicsListeners: Set<(dt: number) => void> = new Set();

  /**
   * `showcase` builds the demo scene - lights, meshes, particle stars, a physics
   * floor. It defaults on for the engine demo and the portal hero; a real game passes
   * `false`, because that content used to appear on top of every published world.
   */
  public init(canvas: HTMLCanvasElement, options: { showcase?: boolean } = {}): void {
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 450;

    // Initialize WebGL2 Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height, false);
    configureModelLoader(this.renderer);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, 2));

    // Initialize Scene and Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b10);
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    if (options.showcase !== false) this.buildProceduralScene();
  }

  public getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  private buildProceduralScene(): void {
    if (!this.scene) return;
    const showcase = buildShowcaseScene(this.scene, this.physicsWorld);
    this.centralMesh = showcase.centralMesh;
    this.orbitingMesh = showcase.orbitingMesh;
    this.dynamicLight = showcase.orbitingLight;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (!this.isRunning) {
      this.start();
      return;
    }
    if (this.isPaused) {
      this.isPaused = false;
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  public restart(): void {
    this.simTime = 0;
    this.primaryRotation.set(0, 0, 0);
    this.orbitAngle = 0;
    this.prevRotation.set(0, 0, 0);
    this.prevOrbitAngle = 0;
    this.accumulator = 0;
    this.resume();
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.renderer?.dispose();
    this.scene?.clear();
    this.physicsWorld.clear();
    this.fpsMeter.clear();
    this.beforePhysicsListeners.clear();
  }

  public resize(width: number, height: number): void {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public getScene(): THREE.Scene | null {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera | null { return this.camera; }
  public setFollowCamera(cam: FollowCamera | null): void { this.followCamera = cam; }
  public getFollowCamera(): FollowCamera | null { return this.followCamera; }
  public getPhysicsWorld(): PhysicsWorld { return this.physicsWorld; }
  public setMultiplayerManager(mgr: MultiplayerManager | null): void { this.multiplayerManager = mgr; }

  public onFpsUpdate(cb: (fps: number, frameTimeMs: number) => void): () => void {
    return this.fpsMeter.subscribe(cb);
  }

  /** Runs right before each fixed physics step, for script-driven transforms. */
  public onBeforePhysics(listener: (dt: number) => void): () => void {
    this.beforePhysicsListeners.add(listener);
    return () => this.beforePhysicsListeners.delete(listener);
  }

  public getState(): EngineState {
    return { isRunning: this.isRunning, isPaused: this.isPaused, fps: this.fpsMeter.fps, frameTimeMs: this.fpsMeter.frameTimeMs };
  }
  public async detectCapabilities(): Promise<RendererCapabilities> {
    return (this.capabilities ??= await detectRendererCapabilities());
  }
  public getCapabilities(): RendererCapabilities | null { return this.capabilities; }

  private loop = (currentTime: number) => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.loop);

    if (this.isPaused) {
      this.lastTime = currentTime;
      return;
    }

    const deltaSec = Math.min((currentTime - this.lastTime) / 1000, 0.25);
    this.lastTime = currentTime;
    this.accumulator += deltaSec;

    // Fixed timestep 60Hz physics accumulation
    while (this.accumulator >= this.FIXED_STEP) {
      this.prevRotation.copy(this.primaryRotation);
      this.prevOrbitAngle = this.orbitAngle;

      this.stepPhysics(this.FIXED_STEP);
      this.accumulator -= this.FIXED_STEP;
    }

    // Display interpolation alpha in range [0, 1] for 120Hz display refresh
    const alpha = this.accumulator / this.FIXED_STEP;
    this.render(alpha);
    this.multiplayerManager?.update(deltaSec);

    // Frame metrics
    this.fpsMeter.sample(deltaSec);
  };

  private stepPhysics(dt: number): void {
    for (const listener of this.beforePhysicsListeners) {
      try {
        listener(dt);
      } catch (err) {
        console.error('beforePhysics listener failed:', err);
      }
    }
    this.simTime += dt;
    this.primaryRotation.x += 0.8 * dt;
    this.primaryRotation.y += 1.2 * dt;
    this.orbitAngle += 2.0 * dt;
    this.physicsWorld.step(dt);

    // Dynamic light orbit physics
    if (this.dynamicLight) {
      this.dynamicLight.position.x = Math.cos(this.orbitAngle) * 4;
      this.dynamicLight.position.z = Math.sin(this.orbitAngle) * 4;
      this.dynamicLight.position.y = 2 + Math.sin(this.simTime * 3) * 0.5;
    }
  }

  private render(alpha: number): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    // Interpolate primary mesh rotation
    if (this.centralMesh) {
      this.centralMesh.rotation.x = this.prevRotation.x + (this.primaryRotation.x - this.prevRotation.x) * alpha;
      this.centralMesh.rotation.y = this.prevRotation.y + (this.primaryRotation.y - this.prevRotation.y) * alpha;
    }

    // Interpolate orbiting mesh position
    if (this.orbitingMesh) {
      const interpAngle = this.prevOrbitAngle + (this.orbitAngle - this.prevOrbitAngle) * alpha;
      this.orbitingMesh.position.x = Math.cos(interpAngle) * 3.5;
      this.orbitingMesh.position.z = Math.sin(interpAngle) * 3.5;
      this.orbitingMesh.rotation.y += 0.02;
    }

    // Camera follow update or default showcase breathe
    if (this.followCamera && this.camera) {
      this.followCamera.update(this.camera, alpha * this.FIXED_STEP);
    } else if (this.camera) {
      const camTime = this.simTime + alpha * this.FIXED_STEP;
      this.camera.position.x = Math.sin(camTime * 0.2) * 2;
      this.camera.position.y = 4 + Math.cos(camTime * 0.3) * 0.5;
      this.camera.lookAt(0, 0, 0);
    }

    updateDistanceCulling(this.camera);
    updateOcclusionCulling(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderDiagnostics.capture(this.renderer);
  }
}

export const defaultRuntimeEngine = new RuntimeEngine();
