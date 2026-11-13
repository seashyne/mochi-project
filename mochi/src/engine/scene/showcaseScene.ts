// The engine showcase scene: demo lights, a floating icosahedron, an orbiting
// octahedron, a ring, particle stars and a physics floor.
//
// This is content, not infrastructure. It used to be built unconditionally inside
// `RuntimeEngine.init`, which meant every published game shipped a glowing ring
// around its spawn point, three demo meshes and a 50x50 floor at y = -2.5 on top of
// the world it actually loaded. It is now opt-in: the portal hero and the demo page
// ask for it, a game does not.

import * as THREE from 'three';
import { PhysicsWorld } from '../physics';
import { RigidBody } from '../physics';

export interface ShowcaseScene {
  centralMesh: THREE.Mesh;
  orbitingMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  particleSystem: THREE.Points;
  /** Animated by the engine loop; null when the scene has no orbiting light. */
  orbitingLight: THREE.PointLight;
}

const PARTICLE_COUNT = 200;

export function buildShowcaseScene(scene: THREE.Scene, physicsWorld: PhysicsWorld): ShowcaseScene {
  const ambient = new THREE.AmbientLight(0x1e293b, 1.5);
  ambient.name = 'ShowcaseAmbient';
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0x6366f1, 2.5);
  sun.name = 'ShowcaseSun';
  sun.position.set(5, 10, 7);
  scene.add(sun);

  const orbitingLight = new THREE.PointLight(0x38bdf8, 3, 20);
  orbitingLight.name = 'ShowcaseOrbitLight';
  orbitingLight.position.set(3, 2, 3);
  scene.add(orbitingLight);

  const grid = new THREE.GridHelper(30, 30, 0x6366f1, 0x1e293b);
  grid.name = 'ShowcaseGrid';
  grid.position.y = -2;
  scene.add(grid);

  physicsWorld.addBody(new RigidBody({
    id: 'ground_floor',
    type: 'static',
    position: { x: 0, y: -2.5, z: 0 },
    shape: { type: 'box', halfExtents: { x: 25, y: 0.5, z: 25 } }
  }));

  const centralMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.8, 0),
    new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.25, metalness: 0.8 })
  );
  scene.add(centralMesh);

  const orbitingMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.9 })
  );
  scene.add(orbitingMesh);

  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.04, 16, 80),
    new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.6 })
  );
  ringMesh.rotation.x = Math.PI / 2;
  scene.add(ringMesh);

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = (Math.random() - 0.5) * 30;
    positions[index + 1] = Math.random() * 15 - 2;
    positions[index + 2] = (Math.random() - 0.5) * 30;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleSystem = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0xa5b4fc, size: 0.12, transparent: true, opacity: 0.75 })
  );
  scene.add(particleSystem);

  return { centralMesh, orbitingMesh, ringMesh, particleSystem, orbitingLight };
}
