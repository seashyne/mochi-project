// Three.js TransformControls wrapper managing gizmo visual state, snapping, and mode switching
// Provides translation, rotation, and scaling gizmos with 1-unit and 15-deg snapping

import * as THREE from 'three';
import { TransformControls, TransformControlsMode } from 'three/examples/jsm/controls/TransformControls.js';
import { StudioVec3 } from './types';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface GizmoSnapConfig {
  translation: number;
  rotationDegrees: number;
  scale: number;
}

export const DEFAULT_SNAP_CONFIG: GizmoSnapConfig = {
  translation: 1,
  rotationDegrees: 15,
  scale: 0.25
};

export interface GizmoTransformEvent {
  position: StudioVec3;
  rotation: StudioVec3;
  scale: StudioVec3;
}

export type GizmoChangeCallback = (transform: GizmoTransformEvent) => void;
export type GizmoDraggingCallback = (isDragging: boolean) => void;

export class TransformGizmoController {
  private controls: TransformControls | null = null;
  private helper: THREE.Object3D | null = null;
  private attachedObject: THREE.Object3D | null = null;
  private isSnappingEnabled = false;
  private snapConfig: GizmoSnapConfig = { ...DEFAULT_SNAP_CONFIG };
  private onChangeCallback: GizmoChangeCallback | null = null;
  private onDraggingCallback: GizmoDraggingCallback | null = null;

  public init(
    camera: THREE.Camera,
    domElement: HTMLElement,
    scene: THREE.Scene
  ): void {
    if (domElement && !domElement.style) {
      (domElement as { style?: CSSStyleDeclaration }).style = {} as CSSStyleDeclaration;
    }
    this.controls = new TransformControls(camera, domElement);
    this.helper = this.controls.getHelper();
    scene.add(this.helper);

    this.controls.addEventListener('change', () => {
      if (this.attachedObject && this.onChangeCallback) {
        this.onChangeCallback({
          position: {
            x: this.attachedObject.position.x,
            y: this.attachedObject.position.y,
            z: this.attachedObject.position.z
          },
          rotation: {
            x: this.attachedObject.rotation.x,
            y: this.attachedObject.rotation.y,
            z: this.attachedObject.rotation.z
          },
          scale: {
            x: this.attachedObject.scale.x,
            y: this.attachedObject.scale.y,
            z: this.attachedObject.scale.z
          }
        });
      }
    });

    this.controls.addEventListener('dragging-changed', (event: unknown) => {
      const e = event as { value?: boolean };
      const isDragging = Boolean(e?.value);
      if (this.onDraggingCallback) {
        this.onDraggingCallback(isDragging);
      }
    });
  }

  public attach(object: THREE.Object3D): void {
    if (!this.controls) return;
    this.attachedObject = object;
    this.controls.attach(object);
    if (this.helper) {
      this.helper.visible = true;
    }
  }

  public detach(): void {
    if (!this.controls) return;
    this.attachedObject = null;
    this.controls.detach();
    if (this.helper) {
      this.helper.visible = false;
    }
  }

  public setMode(mode: GizmoMode): void {
    if (!this.controls) return;
    this.controls.setMode(mode as TransformControlsMode);
  }

  public getMode(): GizmoMode {
    if (!this.controls) return 'translate';
    return this.controls.getMode() as GizmoMode;
  }

  public setSnapping(enabled: boolean): void {
    this.isSnappingEnabled = enabled;
    if (!this.controls) return;
    if (enabled) {
      this.controls.setTranslationSnap(this.snapConfig.translation);
      this.controls.setRotationSnap(THREE.MathUtils.degToRad(this.snapConfig.rotationDegrees));
      this.controls.setScaleSnap(this.snapConfig.scale);
    } else {
      this.controls.setTranslationSnap(null);
      this.controls.setRotationSnap(null);
      this.controls.setScaleSnap(null);
    }
  }

  public setSnapConfig(patch: Partial<GizmoSnapConfig>): void {
    this.snapConfig = {
      translation: Math.max(0.1, Math.min(16, patch.translation ?? this.snapConfig.translation)),
      rotationDegrees: Math.max(1, Math.min(90, patch.rotationDegrees ?? this.snapConfig.rotationDegrees)),
      scale: Math.max(0.05, Math.min(4, patch.scale ?? this.snapConfig.scale))
    };
    this.setSnapping(this.isSnappingEnabled);
  }

  public getSnapConfig(): GizmoSnapConfig {
    return { ...this.snapConfig };
  }

  public isSnapping(): boolean {
    return this.isSnappingEnabled;
  }

  public isDragging(): boolean {
    return Boolean(this.controls?.dragging);
  }

  public isHovered(): boolean {
    return Boolean(this.controls && this.controls.axis !== null);
  }

  public onChange(callback: GizmoChangeCallback): void {
    this.onChangeCallback = callback;
  }

  public onDragging(callback: GizmoDraggingCallback): void {
    this.onDraggingCallback = callback;
  }

  public dispose(scene?: THREE.Scene | null): void {
    if (this.helper && scene) {
      scene.remove(this.helper);
    }
    if (this.controls) {
      this.controls.detach();
      this.controls.dispose();
      this.controls = null;
    }
    this.helper = null;
    this.attachedObject = null;
  }
}
