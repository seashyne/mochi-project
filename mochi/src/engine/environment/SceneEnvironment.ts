// Applies an EnvironmentState to a THREE.Scene: HDR skybox lighting, sun,
// ambient fill, and fog. Decoded HDR textures are cached per preset id so
// switching skyboxes in the Studio does not re-download or re-decode.

import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import type { EnvironmentState } from './environmentTypes';
import { getSkyboxPreset, resolveSkyboxUrl } from './skyboxPresets';

const textureCache = new Map<string, THREE.Texture>();

export interface ApplyEnvironmentOptions {
  assetBase?: string;
  onError?: (error: Error) => void;
}

function sunDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  const horizontal = Math.cos(elevation);
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal
  ).normalize();
}

export class SceneEnvironment {
  private scene: THREE.Scene;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private environmentTexture: THREE.Texture | null = null;
  private requestId = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.name = 'EnvironmentSun';
    this.sun.castShadow = true;
    this.ambient = new THREE.HemisphereLight('#ffffff', '#2a2a33', 0.6);
    this.ambient.name = 'EnvironmentAmbient';
    this.scene.add(this.sun);
    this.scene.add(this.ambient);
  }

  getSun(): THREE.DirectionalLight {
    return this.sun;
  }

  getAmbient(): THREE.HemisphereLight {
    return this.ambient;
  }

  // Lighting-only update: cheap enough to call on every inspector slider move.
  applyLighting(state: EnvironmentState): void {
    const preset = getSkyboxPreset(state.skyboxId);
    this.sun.color.set(preset.sunColor);
    this.sun.intensity = preset.sunIntensity;
    this.sun.position.copy(sunDirection(state.sunAzimuth, state.sunElevation).multiplyScalar(60));
    this.ambient.color.set(preset.fogColor);
    this.ambient.intensity = state.ambientIntensity;

    if (state.fogEnabled) {
      this.scene.fog = new THREE.FogExp2(state.fogColor, state.fogDensity);
    } else {
      this.scene.fog = null;
    }
  }

  async apply(
    state: EnvironmentState,
    renderer: THREE.WebGLRenderer,
    options: ApplyEnvironmentOptions = {}
  ): Promise<void> {
    this.applyLighting(state);
    // Exposure is meaningless without a mode: three defaults to NoToneMapping, so the
    // slider used to do nothing and bright skyboxes clipped to white.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = state.exposure;

    const preset = getSkyboxPreset(state.skyboxId);
    const requestId = ++this.requestId;
    const url = resolveSkyboxUrl(preset.environment, options.assetBase);

    try {
      const texture = await this.loadTexture(url);
      if (this.disposed || requestId !== this.requestId) return;

      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const target = pmrem.fromEquirectangular(texture);
      pmrem.dispose();

      this.disposeEnvironmentTexture();
      this.environmentTexture = target.texture;
      texture.mapping = THREE.EquirectangularReflectionMapping;

      this.scene.background = texture;
      this.scene.environment = target.texture;
      this.scene.backgroundIntensity = state.exposure;
    } catch (error) {
      options.onError?.(error as Error);
    }
  }

  private async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = textureCache.get(url);
    if (cached) return cached;

    const loader = new EXRLoader();
    const texture = await loader.loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    textureCache.set(url, texture);
    return texture;
  }

  private disposeEnvironmentTexture(): void {
    if (this.environmentTexture) {
      this.environmentTexture.dispose();
      this.environmentTexture = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.requestId++;
    this.disposeEnvironmentTexture();
    this.scene.remove(this.sun);
    this.scene.remove(this.ambient);
    this.sun.dispose();
    this.ambient.dispose();
    this.scene.fog = null;
    this.scene.environment = null;
    this.scene.background = null;
  }
}

// Test seam: lets suites clear the module-level texture cache between cases.
export function clearSkyboxTextureCache(): void {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}
