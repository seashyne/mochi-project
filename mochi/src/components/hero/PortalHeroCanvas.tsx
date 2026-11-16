// Interactive Three.js WebGL Dimensional Portal Hero Canvas
// Renders concentric rotating energy torus rings, a levitating crystalline icosahedron core,
// orbiting star/voxel particles, dynamic point lights, and damped mouse pointer parallax
// with automatic CSS holographic fallback and deterministic GPU resource disposal.

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface PortalHeroCanvasProps {
  caption?: string;
  className?: string;
}

export const PortalHeroCanvas: React.FC<PortalHeroCanvasProps> = ({
  caption,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      // Headless browser or GPU-disabled environment: switch cleanly to CSS holographic portal
      setWebglAvailable(false);
      return;
    }

    const initialWidth = Math.max(container.clientWidth, 280);
    const initialHeight = Math.max(container.clientHeight, 300);
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, initialWidth / initialHeight, 0.1, 100);
    camera.position.set(0, 0.15, 7.2);

    // Root group receives smooth pointer parallax tilt
    const portalGroup = new THREE.Group();
    scene.add(portalGroup);

    // Track disposable GPU resources for leak-free unmount cleanup
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    // Lighting rig: ambient base + directional key + twin cyan/indigo point lights
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.8);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.4);
    rimLight.position.set(4, 6, 5);
    scene.add(rimLight);

    const cyanLight = new THREE.PointLight(0x00a2ff, 4.2, 16);
    cyanLight.position.set(2.4, 1.4, 2.5);
    portalGroup.add(cyanLight);

    const indigoLight = new THREE.PointLight(0x6366f1, 3.8, 16);
    indigoLight.position.set(-2.4, -1.4, 2.2);
    portalGroup.add(indigoLight);

    // Concentric rotating energy torus rings
    const outerRingGeo = new THREE.TorusGeometry(2.32, 0.055, 24, 96);
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x00a2ff,
      emissive: 0x0077cc,
      emissiveIntensity: 0.9,
      metalness: 0.85,
      roughness: 0.18
    });
    geometries.push(outerRingGeo);
    materials.push(outerRingMat);
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    portalGroup.add(outerRing);

    const midRingGeo = new THREE.TorusGeometry(1.82, 0.038, 20, 88);
    const midRingMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.85,
      metalness: 0.8,
      roughness: 0.22
    });
    geometries.push(midRingGeo);
    materials.push(midRingMat);
    const midRing = new THREE.Mesh(midRingGeo, midRingMat);
    midRing.rotation.x = Math.PI * 0.28;
    portalGroup.add(midRing);

    const innerRingGeo = new THREE.TorusGeometry(1.32, 0.026, 16, 72);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82
    });
    geometries.push(innerRingGeo);
    materials.push(innerRingMat);
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.y = Math.PI * 0.32;
    portalGroup.add(innerRing);

    // Levitating crystalline icosahedron core + outer wireframe lattice
    const coreGeo = new THREE.IcosahedronGeometry(0.76, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.65,
      metalness: 0.9,
      roughness: 0.12,
      flatShading: true
    });
    geometries.push(coreGeo);
    materials.push(coreMat);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    portalGroup.add(coreMesh);

    const cageGeo = new THREE.IcosahedronGeometry(0.96, 1);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.26
    });
    geometries.push(cageGeo);
    materials.push(cageMat);
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    portalGroup.add(cageMesh);

    // Orbiting voxel/star particle vortex
    const particleCount = 160;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.45 + Math.random() * 1.95;
      const angle = (i / particleCount) * Math.PI * 8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.055,
      transparent: true,
      opacity: 0.85
    });
    geometries.push(particleGeo);
    materials.push(particleMat);
    const particleField = new THREE.Points(particleGeo, particleMat);
    portalGroup.add(particleField);

    const handleResize = () => {
      if (!container || !renderer) return;
      const w = Math.max(container.clientWidth, 240);
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', handleResize);

    let animFrameId = 0;
    const startClock = performance.now();

    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);
      const elapsed = (now - startClock) * 0.001;

      // Smooth damped pointer parallax interpolation
      portalGroup.rotation.y += (pointerTargetRef.current.x * 0.42 - portalGroup.rotation.y) * 0.07;
      portalGroup.rotation.x += (pointerTargetRef.current.y * 0.32 - portalGroup.rotation.x) * 0.07;

      // Gyroscopic ring and levitating crystal core motion
      outerRing.rotation.z = elapsed * 0.35;
      midRing.rotation.x = Math.PI * 0.28 + elapsed * 0.55;
      midRing.rotation.y = elapsed * 0.38;
      innerRing.rotation.x = -elapsed * 0.72;
      innerRing.rotation.z = elapsed * 0.48;

      const floatY = Math.sin(elapsed * 2.1) * 0.14;
      coreMesh.position.y = floatY;
      coreMesh.rotation.x = elapsed * 0.65;
      coreMesh.rotation.y = elapsed * 0.92;
      cageMesh.position.y = floatY;
      cageMesh.rotation.x = -elapsed * 0.42;
      cageMesh.rotation.y = -elapsed * 0.58;

      particleField.rotation.z = -elapsed * 0.18;
      cyanLight.position.x = Math.cos(elapsed * 1.3) * 2.6;
      cyanLight.position.y = Math.sin(elapsed * 1.3) * 2.6;

      renderer?.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      geometries.forEach((geo) => geo.dispose());
      materials.forEach((mat) => mat.dispose());
      scene.clear();
      renderer?.dispose();
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerTargetRef.current = { x: nx, y: ny };
  };

  const handlePointerLeave = () => {
    pointerTargetRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative w-full h-80 md:h-[360px] select-none overflow-hidden rounded-2xl ${className}`}
    >
      {/* Ambient radial portal glow behind WebGL or CSS fallback */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,162,255,0.22),rgba(99,102,241,0.12)_45%,transparent_72%)] pointer-events-none" />

      {webglAvailable ? (
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />
      ) : (
        /* Graceful CSS holographic portal fallback for non-WebGL environments */
        <div className="w-full h-full flex items-center justify-center relative">
          <div className="w-52 h-52 rounded-full border-2 border-[#00a2ff]/60 shadow-mochi-cyan flex items-center justify-center animate-spin">
            <div className="w-36 h-36 rounded-full border border-indigo-400/60 flex items-center justify-center">
              <div className="w-16 h-16 rotate-45 rounded-xl bg-gradient-to-tr from-[#00a2ff] to-indigo-500 shadow-mochi-cyan" />
            </div>
          </div>
        </div>
      )}

      {caption && (
        <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/90 dark:bg-[#090b10]/80 border border-slate-200 dark:border-white/10 backdrop-blur-md pointer-events-none">
          <span className="text-[11px] font-mono text-sky-700 dark:text-sky-300 font-semibold truncate">{caption}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            WebGL 3D
          </span>
        </div>
      )}
    </div>
  );
};

export default PortalHeroCanvas;
