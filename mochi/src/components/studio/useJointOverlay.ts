// Draws dashed links between the two attachments of every joint object so the
// editor shows constraint topology that has no geometry of its own.

import { useEffect } from 'react';
import * as THREE from 'three';
import type { StudioScene } from '../../engine/studio/studioScene';
import type { StudioObject } from '../../engine/studio/types';

const LINK_COLOR = 0xc084fc;

function toVector(position: StudioObject['position']): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.y, position.z);
}

export function useJointOverlay(sceneEngine: StudioScene, objects: StudioObject[]): void {
  useEffect(() => {
    const scene = sceneEngine.getScene();
    if (!scene) return;
    const group = new THREE.Group();
    group.name = 'studio_joint_overlay';
    scene.add(group);
    const byId = new Map(objects.map((obj) => [obj.id, obj]));

    for (const obj of objects) {
      if (obj.type !== 'constraint' || !obj.constraint) continue;
      const a = byId.get(obj.constraint.attachment0);
      const b = byId.get(obj.constraint.attachment1);
      if (!a || !b) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        toVector(a.position),
        toVector(b.position)
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({ color: LINK_COLOR, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.85 })
      );
      line.computeLineDistances();
      line.userData = { jointId: obj.id };
      group.add(line);
    }

    return () => {
      scene.remove(group);
      group.traverse((child) => {
        const line = child as THREE.Line;
        line.geometry?.dispose?.();
        (line.material as THREE.Material | undefined)?.dispose?.();
      });
    };
  }, [sceneEngine, objects]);
}
