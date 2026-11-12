// Multi-object selection highlight overlay for the Studio viewport.
// Renders one wireframe BoxHelper per selected object so batch selections stay legible.

import * as THREE from 'three';

export const SELECTION_COLOR = 0x00a2ff;

export class SelectionOverlay {
  private helpers: THREE.BoxHelper[] = [];
  private scene: THREE.Scene | null = null;

  public mount(scene: THREE.Scene): void {
    this.scene = scene;
  }

  public show(targets: THREE.Object3D[]): void {
    this.clear();
    if (!this.scene) return;
    for (const target of targets) {
      const helper = new THREE.BoxHelper(target, SELECTION_COLOR);
      this.scene.add(helper);
      this.helpers.push(helper);
    }
  }

  public update(): void {
    for (const helper of this.helpers) {
      helper.update();
    }
  }

  public clear(): void {
    for (const helper of this.helpers) {
      this.scene?.remove(helper);
      helper.dispose();
    }
    this.helpers = [];
  }

  public count(): number {
    return this.helpers.length;
  }

  public dispose(): void {
    this.clear();
    this.scene = null;
  }
}
