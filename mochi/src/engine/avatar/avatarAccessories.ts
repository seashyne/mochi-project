// Procedural 3D avatar accessories, cosmetics, and attachment primitives across all slots

import * as THREE from 'three';
import { CosmeticSlot } from '../../api/shopTypes';

export type PrimitiveShape = 'box' | 'cylinder' | 'sphere' | 'torus' | 'cone';

export interface PrimitiveSpec {
  shape: PrimitiveShape;
  args: number[];
  position: [number, number, number];
  rotation?: [number, number, number];
}

export interface AccessoryInstance {
  group: THREE.Group;
  dispose: () => void;
}

export interface RenderableAccessory {
  style: string;
  color?: string;
}

const HALF_PI = Math.PI / 2;
const FULL_TURN = Math.PI * 2;

// Hat primitives (attached to head group origin, head is 0.55 cube)
const HAT_STYLES: Record<string, PrimitiveSpec[]> = {
  beanie: [
    { shape: 'sphere', args: [0.33, 16, 12, 0, FULL_TURN, 0, HALF_PI], position: [0, 0.2, 0] },
    { shape: 'torus', args: [0.29, 0.06, 8, 20], position: [0, 0.22, 0], rotation: [HALF_PI, 0, 0] }
  ],
  cap: [
    { shape: 'sphere', args: [0.31, 16, 12, 0, FULL_TURN, 0, HALF_PI], position: [0, 0.22, 0] },
    { shape: 'box', args: [0.42, 0.04, 0.28], position: [0, 0.24, 0.3] }
  ],
  crown: [
    { shape: 'cylinder', args: [0.28, 0.3, 0.16, 12], position: [0, 0.36, 0] },
    { shape: 'cone', args: [0.06, 0.16, 6], position: [0.22, 0.5, 0] },
    { shape: 'cone', args: [0.06, 0.16, 6], position: [-0.22, 0.5, 0] },
    { shape: 'cone', args: [0.06, 0.16, 6], position: [0, 0.5, 0.22] },
    { shape: 'cone', args: [0.06, 0.16, 6], position: [0, 0.5, -0.22] }
  ],
  halo: [
    { shape: 'torus', args: [0.28, 0.04, 8, 24], position: [0, 0.62, 0], rotation: [HALF_PI, 0, 0] }
  ],
  horns: [
    { shape: 'cone', args: [0.07, 0.26, 8], position: [0.2, 0.4, 0], rotation: [0, 0, -0.35] },
    { shape: 'cone', args: [0.07, 0.26, 8], position: [-0.2, 0.4, 0], rotation: [0, 0, 0.35] }
  ],
  bucket: [
    { shape: 'cylinder', args: [0.28, 0.3, 0.24, 16], position: [0, 0.38, 0] },
    { shape: 'cylinder', args: [0.44, 0.44, 0.04, 16], position: [0, 0.27, 0] }
  ]
};

// Shirt primitives (attached to torso group origin, torso is 0.85 x 0.95 x 0.5)
const SHIRT_STYLES: Record<string, PrimitiveSpec[]> = {
  decal: [{ shape: 'box', args: [0.3, 0.3, 0.03], position: [0, 0.1, 0.26] }],
  stripes: [
    { shape: 'box', args: [0.87, 0.1, 0.52], position: [0, 0.2, 0] },
    { shape: 'box', args: [0.87, 0.1, 0.52], position: [0, -0.05, 0] }
  ],
  hoodie: [
    { shape: 'box', args: [0.9, 1.0, 0.55], position: [0, 0, 0] },
    { shape: 'box', args: [0.42, 0.26, 0.22], position: [0, 0.56, -0.18] }
  ],
  vest: [
    { shape: 'box', args: [0.26, 0.99, 0.54], position: [0.29, 0, 0] },
    { shape: 'box', args: [0.26, 0.99, 0.54], position: [-0.29, 0, 0] }
  ],
  tee: [{ shape: 'box', args: [0.88, 0.72, 0.53], position: [0, 0.11, 0] }],
  jacket: [
    { shape: 'box', args: [0.92, 1.0, 0.56], position: [0, 0, 0] },
    { shape: 'box', args: [0.52, 0.12, 0.58], position: [0, 0.46, 0] }
  ]
};

// Hair primitives (attached to head group)
const HAIR_STYLES: Record<string, PrimitiveSpec[]> = {
  spikes: [
    { shape: 'cone', args: [0.08, 0.22, 6], position: [0, 0.38, 0.05], rotation: [0.2, 0, 0] },
    { shape: 'cone', args: [0.07, 0.2, 6], position: [0.15, 0.36, -0.05], rotation: [0, 0, -0.2] },
    { shape: 'cone', args: [0.07, 0.2, 6], position: [-0.15, 0.36, -0.05], rotation: [0, 0, 0.2] }
  ],
  afro: [
    { shape: 'sphere', args: [0.38, 16, 12], position: [0, 0.25, -0.02] }
  ],
  ponytail: [
    { shape: 'sphere', args: [0.32, 12, 10], position: [0, 0.2, 0] },
    { shape: 'cylinder', args: [0.06, 0.09, 0.45, 8], position: [0, 0.1, -0.38], rotation: [-0.6, 0, 0] }
  ]
};

// Back accessories (attached to torso group rear)
const BACK_STYLES: Record<string, PrimitiveSpec[]> = {
  wings: [
    { shape: 'box', args: [0.7, 0.3, 0.04], position: [0.5, 0.2, -0.32], rotation: [0, 0.3, 0.4] },
    { shape: 'box', args: [0.7, 0.3, 0.04], position: [-0.5, 0.2, -0.32], rotation: [0, -0.3, -0.4] }
  ],
  pack: [
    { shape: 'box', args: [0.5, 0.6, 0.24], position: [0, 0.05, -0.38] }
  ],
  katana: [
    { shape: 'cylinder', args: [0.03, 0.03, 1.2, 8], position: [0, 0.1, -0.32], rotation: [0, 0, 0.75] },
    { shape: 'cylinder', args: [0.03, 0.03, 1.2, 8], position: [0, 0.1, -0.32], rotation: [0, 0, -0.75] }
  ]
};

export function getSlotPrimitives(slot: CosmeticSlot | string, style: string): PrimitiveSpec[] {
  switch (slot) {
    case 'hat':
      return HAT_STYLES[style] || HAT_STYLES.cap;
    case 'shirt':
      return SHIRT_STYLES[style] || SHIRT_STYLES.tee;
    case 'hair':
      return HAIR_STYLES[style] || HAIR_STYLES.spikes;
    case 'back':
      return BACK_STYLES[style] || BACK_STYLES.wings;
    default:
      return [];
  }
}

export const getStylePrimitives = getSlotPrimitives;

function createGeometry(spec: PrimitiveSpec): THREE.BufferGeometry {
  const a = spec.args;
  switch (spec.shape) {
    case 'cylinder':
      return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3]);
    case 'sphere':
      return new THREE.SphereGeometry(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
    case 'torus':
      return new THREE.TorusGeometry(a[0], a[1], a[2], a[3]);
    case 'cone':
      return new THREE.ConeGeometry(a[0], a[1], a[2]);
    default:
      return new THREE.BoxGeometry(a[0], a[1], a[2]);
  }
}

export function createAccessoryGroup(
  slot: CosmeticSlot | string,
  accessory: RenderableAccessory
): AccessoryInstance {
  const group = new THREE.Group();
  group.name = `avatar_${slot}`;

  const hexColor = accessory.color || '#00a2ff';
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hexColor),
    roughness: 0.4,
    metalness: 0.15
  });
  const geometries: THREE.BufferGeometry[] = [];

  for (const spec of getSlotPrimitives(slot, accessory.style)) {
    const geometry = createGeometry(spec);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...spec.position);
    if (spec.rotation) mesh.rotation.set(...spec.rotation);
    mesh.castShadow = true;
    group.add(mesh);
  }

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      material.dispose();
      group.clear();
    }
  };
}
