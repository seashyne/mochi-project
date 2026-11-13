// Remote player avatar geometry. Kept out of MultiplayerManager so that file
// stays about networking and interpolation.

import * as THREE from 'three';

  // Construct stylized 3D avatar for remote players with glowing visor
export function createPeerAvatar(username: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `avatar_${username}`;

  // Body Capsule/Cylinder
  const bodyGeom = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.3,
    metalness: 0.7
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.55;
  group.add(body);

  // Head Sphere
  const headGeom = new THREE.SphereGeometry(0.3, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.2,
    metalness: 0.9
  });
  const head = new THREE.Mesh(headGeom, headMat);
  head.position.y = 1.35;
  group.add(head);

  // Glowing Neon Visor
  const visorGeom = new THREE.BoxGeometry(0.35, 0.12, 0.2);
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x00a2ff });
  const visor = new THREE.Mesh(visorGeom, visorMat);
  visor.position.set(0, 1.35, 0.22);
  group.add(visor);

  // Cyber Base Ring
  const ringGeom = new THREE.RingGeometry(0.4, 0.45, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  return group;
}
