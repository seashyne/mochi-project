// Three.js stage for a playtest session: renderer, lit scene, grid floor and orbit camera.

import * as THREE from 'three';
import { FollowCamera } from '../camera/followCamera';

export interface PlaytestSceneBundle {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  followCamera: FollowCamera;
  resize: () => void;
  attachControls: () => () => void;
  dispose: () => void;
}

// The editor plate is dark grey; the sky has to sit well below it or the
// ground reads as empty space in a small viewport.
const SKY = 0x161e2e;

export function createPlaytestScene(canvas: HTMLCanvasElement): PlaytestSceneBundle {
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 450;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 190);

  const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 400);
  camera.position.set(0, 9, 15);

  scene.add(new THREE.HemisphereLight(0xbfdbfe, 0x334155, 1.55));
  const sun = new THREE.DirectionalLight(0xffffff, 2.7);
  sun.position.set(14, 22, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x38bdf8, 0.7);
  rim.position.set(-12, 8, -14);
  scene.add(rim);

  const grid = new THREE.GridHelper(80, 80, 0x6366f1, 0x334155);
  // Sit just above the plate top so the two coplanar surfaces never z-fight.
  grid.position.y = 0.002;
  scene.add(grid);

  const followCamera = new FollowCamera({ radius: 8, phi: Math.PI / 3.1, heightOffset: 1.15, smoothSpeed: 12 });

  const resize = () => {
    const nextWidth = canvas.clientWidth || 800;
    const nextHeight = canvas.clientHeight || 450;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
  };

  // The modal animates in, so the first measured size can be stale.
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  const attachControls = () => {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      followCamera.orbit(dx, dy);
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      followCamera.zoom(Math.sign(event.deltaY) * 0.8);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  };

  const dispose = () => {
    observer?.disconnect();
    renderer.dispose();
    scene.clear();
  };

  return { canvas, renderer, scene, camera, followCamera, resize, attachControls, dispose };
}
