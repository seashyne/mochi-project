// Three.js interactive 3D scene engine for Studio World Builder
// Supports object placement, raycast selection, batch selection, and orbit viewing

import * as THREE from 'three';
import { StudioObject, StudioSceneSnapshot } from './types';
import { buildObjectMesh } from './studioMeshBuilder';
import { configureModelLoader, mountModel } from '../assets/modelLoader';
import { TransformGizmoController, GizmoMode, GizmoTransformEvent, GizmoSnapConfig } from './transformGizmo';
import { SelectionOverlay } from './selectionOverlay';
import { StudioCameraRig, attachStudioPointer } from './studioViewportInput';
import { buildTerrainGeometry } from './terrainMesh';
import { sculptTerrainAt, selectionIdAt } from './studioInteraction';
import type { TransformUpdate } from './multiTransform';
import { GizmoTransformBroker } from './gizmoBroker';
import type { TerrainBrush, TerrainData } from './advancedTypes';
import { frameObjects } from './sceneFraming';

export type SelectionCallback = (selectedId: string | null) => void;
export type SelectionSetCallback = (selectedIds: string[]) => void;
export type TransformCallback = (id: string, transform: GizmoTransformEvent) => void;
export type TerrainEditCallback = (id: string, terrain: TerrainData) => void;
export type TransformSetCallback = (updates: TransformUpdate[]) => void;

export class StudioScene {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private animId: number | null = null;

  private objectEntries: Map<string, { data: StudioObject; mesh: THREE.Object3D }> = new Map();
  private overlay: SelectionOverlay = new SelectionOverlay();
  private selectedIds: string[] = [];
  private onSelectionChange: SelectionCallback | null = null;
  private onSelectionSetChange: SelectionSetCallback | null = null;
  private onTransformChange: TransformCallback | null = null;
  private onTransformSetChange: TransformSetCallback | null = null;
  private gizmo: TransformGizmoController = new TransformGizmoController();
  private isGizmoDragging = false;
  private broker: GizmoTransformBroker | null = null;
  private cameraRig: StudioCameraRig | null = null;
  private detachPointer: (() => void) | null = null;
  private brush: TerrainBrush | null = null;
  private onTerrainEdit: TerrainEditCallback | null = null;
  private flyMode = false;
  private lastFrameTime = 0;
  private hasFramedScene = false;

  public init(
    canvas: HTMLCanvasElement,
    onSelect?: SelectionCallback,
    onTransform?: TransformCallback
  ): void {
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 500;
    this.onSelectionChange = onSelect || null;
    this.onTransformChange = onTransform || null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height, false);
    configureModelLoader(this.renderer);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b10);
    this.overlay.mount(this.scene);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.cameraRig = new StudioCameraRig(this.camera);

    // Lighting
    const amb = new THREE.AmbientLight(0x1e293b, 1.8);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 2.5);
    dir.position.set(15, 25, 15);
    this.scene.add(dir);

    // Grid
    const grid = new THREE.GridHelper(64, 64, 0x00a2ff, 0x1e293b);
    grid.position.y = 0;
    this.scene.add(grid);

    // Initialize Gizmo
    this.gizmo.init(this.camera, canvas, this.scene);
    this.broker = new GizmoTransformBroker({
      getSelectedIds: () => this.selectedIds,
      getObject: (id) => this.objectEntries.get(id)?.data,
      getMode: () => this.gizmo.getMode(),
      apply: (id, transform) => this.updateObject(id, transform)
    });
    this.broker.setCallbacks(
      (id, transform) => this.onTransformChange?.(id, transform),
      (updates) => this.onTransformSetChange?.(updates)
    );
    this.gizmo.onChange((transform) => this.broker?.change(transform));
    this.gizmo.onDragging((dragging) => { this.isGizmoDragging = dragging; this.broker?.setDragging(dragging); });

    this.attachViewportHandlers(canvas);
    this.startLoop();
  }

  /** Enabling a brush switches left-drag from camera orbit to sculpting. */
  public setTerrainBrush(brush: TerrainBrush | null): void { this.brush = brush; }
  public setTerrainEditCallback(cb: TerrainEditCallback | null): void { this.onTerrainEdit = cb; }
  public setTransformSetCallback(cb: TransformSetCallback | null): void { this.onTransformSetChange = cb; }
  public getCameraRig(): StudioCameraRig | null { return this.cameraRig; }
  public setFlyMode(enabled: boolean): void { this.flyMode = enabled; if (!enabled) this.cameraRig?.clearKeys(); }
  public setSnapConfig(patch: Partial<GizmoSnapConfig>): void { this.gizmo.setSnapConfig(patch); }
  public getSnapConfig(): GizmoSnapConfig { return this.gizmo.getSnapConfig(); }

  /** Frames every selected object; falls back to the current view when empty. */
  public focusSelection(): void {
    const meshes = this.selectedIds.map((id) => this.objectEntries.get(id)?.mesh);
    if (this.cameraRig) frameObjects(this.cameraRig, meshes.filter((m): m is THREE.Object3D => Boolean(m)));
  }

  public setSelectionSetCallback(cb?: SelectionSetCallback): void { this.onSelectionSetChange = cb || null; }
  public addObject(obj: StudioObject): void { this.addObjectInternal(obj, true); }

  /** Bulk load used by history restore and draft loading: rebuilds without selection churn. */
  public replaceAll(objects: StudioObject[]): void {
    this.clearAll();
    objects.forEach((obj) => this.addObjectInternal(obj, false));
    // Frame the opening scene once, like a scene editor does when a file loads.
    // Later replaceAll calls (undo, redo, remote sync) keep the user's camera.
    const meshes = [...this.objectEntries.values()].map((entry) => entry.mesh);
    if (!this.hasFramedScene && this.cameraRig) this.hasFramedScene = frameObjects(this.cameraRig, meshes);
  }

  private addObjectInternal(obj: StudioObject, select: boolean): void {
    if (!this.scene) return;
    const mesh = buildObjectMesh(obj);
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    mesh.userData = { id: obj.id };

    this.scene.add(mesh);
    this.objectEntries.set(obj.id, { data: obj, mesh });
    if (obj.type === 'model' && obj.assetUrl) mountModel(mesh, obj.assetUrl, { lod: false });
    if (select) this.selectObject(obj.id);
  }

  public updateObject(id: string, updates: Partial<StudioObject>): void {
    const entry = this.objectEntries.get(id);
    if (!entry) return;

    entry.data = { ...entry.data, ...updates };
    if (updates.position) entry.mesh.position.set(entry.data.position.x, entry.data.position.y, entry.data.position.z);
    if (updates.scale) entry.mesh.scale.set(entry.data.scale.x, entry.data.scale.y, entry.data.scale.z);
    if (updates.rotation) entry.mesh.rotation.set(entry.data.rotation.x, entry.data.rotation.y, entry.data.rotation.z);
    if (updates.color && entry.mesh instanceof THREE.Mesh && entry.mesh.material instanceof THREE.MeshStandardMaterial) {
      entry.mesh.material.color.set(entry.data.color);
    }
    if (updates.terrain && entry.mesh instanceof THREE.Mesh) {
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = buildTerrainGeometry(updates.terrain);
    }
    if (this.selectedIds.includes(id)) this.overlay.update();
  }

  public removeObject(id: string): void {
    const entry = this.objectEntries.get(id);
    if (!entry || !this.scene) return;
    this.scene.remove(entry.mesh);
    this.objectEntries.delete(id);
    if (this.selectedIds.includes(id)) {
      this.selectObjects(this.selectedIds.filter((curr) => curr !== id));
    }
  }

  public selectObject(id: string | null): void {
    this.selectObjects(id ? [id] : []);
  }

  public selectObjects(ids: string[]): void {
    if (!this.scene) return;
    const unique = Array.from(new Set(ids)).filter((id) => this.objectEntries.has(id));
    const changed = unique.length !== this.selectedIds.length || unique.some((id, index) => this.selectedIds[index] !== id);
    this.selectedIds = unique;

    const targets = unique
      .map((id) => this.objectEntries.get(id)?.mesh)
      .filter((mesh): mesh is THREE.Object3D => Boolean(mesh));
    this.overlay.show(targets);

    const primary = unique[0] ? this.objectEntries.get(unique[0])?.mesh : null;
    if (primary) {
      this.gizmo.attach(primary);
    } else {
      this.gizmo.detach();
    }

    // Notify only on real changes: callbacks re-enter selectObjects, and an
    // unconditional notification recurses until the stack overflows.
    if (changed && this.onSelectionChange) this.onSelectionChange(unique[0] ?? null);
    if (changed && this.onSelectionSetChange) this.onSelectionSetChange([...unique]);
  }

  public toggleSelection(id: string): void {
    if (this.selectedIds.includes(id)) {
      this.selectObjects(this.selectedIds.filter((curr) => curr !== id));
    } else {
      this.selectObjects([...this.selectedIds, id]);
    }
  }

  public clearSelection(): void { this.selectObjects([]); }
  public getSelectedId(): string | null { return this.selectedIds[0] ?? null; }
  public getSelectedIds(): string[] { return [...this.selectedIds]; }
  public getRenderer(): THREE.WebGLRenderer | null { return this.renderer; }
  public getScene(): THREE.Scene | null { return this.scene; }
  public setGizmoMode(mode: GizmoMode): void { this.gizmo.setMode(mode); }
  public getGizmoMode(): GizmoMode { return this.gizmo.getMode(); }
  public setGizmoSnapping(enabled: boolean): void { this.gizmo.setSnapping(enabled); }
  public isGizmoSnapping(): boolean { return this.gizmo.isSnapping(); }

  public exportSnapshot(title: string): StudioSceneSnapshot {
    return {
      version: '1.0.0',
      title,
      objects: Array.from(this.objectEntries.values()).map((e) => e.data),
      createdAt: new Date().toISOString()
    };
  }

  public importSnapshot(snapshot: StudioSceneSnapshot): void {
    this.replaceAll(snapshot.objects);
  }

  public clearAll(): void {
    this.selectObjects([]);
    this.objectEntries.forEach((e) => this.scene?.remove(e.mesh));
    this.objectEntries.clear();
  }

  public resize(width: number, height: number): void {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public destroy(): void {
    if (this.animId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animId);
    this.detachPointer?.();
    this.detachPointer = null;
    this.gizmo.dispose(this.scene);
    this.clearAll();
    this.overlay.dispose();
    this.renderer?.dispose();
    this.scene?.clear();
    this.hasFramedScene = false;
  }

  private attachViewportHandlers(canvas: HTMLCanvasElement): void {
    this.detachPointer = attachStudioPointer(canvas, {
      isGizmoBusy: () => this.gizmo.isHovered() || this.gizmo.isDragging() || this.isGizmoDragging,
      onPrimaryDown: (event) => this.handlePrimaryDown(event, canvas),
      onDragMove: (event) => { if (this.brush) this.sculptAt(event.clientX, event.clientY, canvas); },
      onDragEnd: () => { this.isGizmoDragging = false; },
      orbit: (dx, dy) => this.cameraRig?.orbit(dx, dy),
      pan: (dx, dy) => this.cameraRig?.pan(dx, dy),
      zoom: (delta) => this.cameraRig?.zoom(delta),
      onKeyChange: (key, down) => this.cameraRig?.setKey(key, down),
      onKeyClear: () => this.cameraRig?.clearKeys(),
      flyEnabled: () => this.flyMode
    });
  }

  private handlePrimaryDown(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
    if (this.brush) { this.sculptAt(event.clientX, event.clientY, canvas); return true; }
    const id = selectionIdAt(this.camera, this.objectEntries, canvas, event.clientX, event.clientY);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (id) additive ? this.toggleSelection(id) : this.selectObjects([id]);
    else if (!additive) this.clearSelection();
    return false;
  }

  private sculptAt(clientX: number, clientY: number, canvas: HTMLCanvasElement): void {
    const hit = sculptTerrainAt(this.camera, this.objectEntries, canvas, clientX, clientY, this.brush);
    if (!hit) return;
    this.onTerrainEdit?.(hit.id, hit.terrain);
    this.updateObject(hit.id, { terrain: hit.terrain });
  }

  private startLoop(): void {
    const tick = (now?: number) => {
      if (typeof requestAnimationFrame !== 'undefined') this.animId = requestAnimationFrame(tick);
      const dt = this.lastFrameTime && now ? (now - this.lastFrameTime) / 1000 : 0;
      this.lastFrameTime = now ?? 0;
      if (this.flyMode) this.cameraRig?.advance(dt);
      this.overlay.update();
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}
