// Live WebGL preview of the humanoid avatar with drag-to-rotate turntable

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ResolvedAccessories } from '../../api/types';
import { HumanoidAvatarInstance, UserAvatarColors, buildHumanoidAvatar } from '../../engine/avatar/avatarBuilder';

export interface AvatarPreviewCanvasProps {
  colors: Partial<UserAvatarColors>;
  accessories: ResolvedAccessories;
  className?: string;
}

export const AvatarPreviewCanvas: React.FC<AvatarPreviewCanvasProps> = ({
  colors,
  accessories,
  className
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HumanoidAvatarInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 2.1, 6);
    camera.lookAt(0, 1.3, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e1e24, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const podiumGeom = new THREE.CylinderGeometry(1.7, 1.7, 0.12, 40);
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x282830, roughness: 0.9 });
    const podium = new THREE.Mesh(podiumGeom, podiumMat);
    podium.position.y = -0.06;
    podium.receiveShadow = true;
    scene.add(podium);

    const avatar = buildHumanoidAvatar(colors, accessories);
    avatarRef.current = avatar;
    scene.add(avatar.root);

    let yaw = 0.4;
    let dragging = false;
    let lastX = 0;
    let frameId = 0;

    const resize = () => {
      const width = container.clientWidth || 320;
      const height = container.clientHeight || 320;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      yaw += (event.clientX - lastX) * 0.01;
      lastX = event.clientX;
    };
    const onPointerUp = () => { dragging = false; };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'grab';

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const clock = new THREE.Clock();
    const loop = () => {
      frameId = requestAnimationFrame(loop);
      const delta = clock.getDelta();
      if (!dragging) yaw += delta * 0.35;
      avatar.root.rotation.y = yaw;
      avatar.stepAnimation(clock.elapsedTime, 'idle');
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      avatar.dispose();
      avatarRef.current = null;
      podiumGeom.dispose();
      podiumMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // Rig is built once; later edits are applied in place by the effects below
  }, []);

  useEffect(() => {
    avatarRef.current?.updateColors(colors);
  }, [colors]);

  useEffect(() => {
    avatarRef.current?.setAccessories(accessories);
  }, [accessories]);

  return <div ref={containerRef} className={className} data-testid="avatar-preview-canvas" />;
};

export default AvatarPreviewCanvas;