// Viewport navigation and picking, separated from the scene graph owner so the
// StudioScene class stays small enough for the SRP line ceiling.

import * as THREE from 'three';

export { StudioCameraRig, VIEW_PRESETS } from './studioCameraRig';
export type { ViewPreset } from './studioCameraRig';

export interface StudioViewportHandlers {
  /** True while the transform gizmo owns the pointer. */
  isGizmoBusy: () => boolean;
  /** Return true to suppress camera orbit for the whole drag (e.g. sculpting). */
  onPrimaryDown: (event: PointerEvent) => boolean;
  onDragMove: (event: PointerEvent) => void;
  onDragEnd: () => void;
  orbit: (dx: number, dy: number) => void;
  pan: (dx: number, dy: number) => void;
  zoom: (deltaY: number) => void;
  /** WASD/QE free-flight; only delivered while fly mode is on and not typing. */
  onKeyChange?: (key: string, down: boolean) => void;
  onKeyClear?: () => void;
  flyEnabled?: () => boolean;
  isTyping?: () => boolean;
}

function defaultTyping(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  return Boolean(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable));
}

export function attachStudioPointer(
  canvas: HTMLCanvasElement,
  handlers: StudioViewportHandlers
): () => void {
  let dragging = false;
  let orbitSuppressed = false;
  let panMode = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (handlers.isGizmoBusy()) return;
    dragging = true;
    orbitSuppressed = false;
    panMode = event.button === 1 || event.button === 2;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!panMode && event.button === 0 && handlers.onPrimaryDown(event)) orbitSuppressed = true;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (handlers.isGizmoBusy()) return;
    if (panMode) handlers.pan(dx, dy);
    else if (orbitSuppressed) handlers.onDragMove(event);
    else handlers.orbit(dx, dy);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    orbitSuppressed = false;
    panMode = false;
    handlers.onDragEnd();
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    handlers.zoom(event.deltaY);
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent) => {
    if (!handlers.flyEnabled?.() || (handlers.isTyping ?? defaultTyping)()) return;
    handlers.onKeyChange?.(event.key, true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (!handlers.onKeyChange) return;
    handlers.onKeyChange(event.key, false);
  };
  const onBlur = () => handlers.onKeyClear?.();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', onContextMenu);
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    }
    canvas.removeEventListener('wheel', onWheel);
  };
}

export interface StudioPick {
  root: THREE.Object3D;
  point: THREE.Vector3;
}

export function pickStudioObject(
  camera: THREE.Camera,
  meshes: THREE.Object3D[],
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): StudioPick | null {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  let root: THREE.Object3D | null = hits[0].object;
  while (root && !root.userData.id) root = root.parent;
  return root ? { root, point: hits[0].point.clone() } : null;
}
