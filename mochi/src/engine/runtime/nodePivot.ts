// Pivot resolution and rigid subtree transforms (`GetPivot`, `PivotTo`, `WorldPivot`,
// `PrimaryPart`, `PivotOffset`) for parts and models.

import * as THREE from 'three';
import { rotationMatrix } from '../physics/oriented';
import { makeCFrameValue, readCFrameValue } from './cframeBridge';
import type { LiveNode, NodeTransform } from './liveNode';
import { defineAlias } from './luaProxyUtils';
import { notifyChanged } from './nodeSignals';
import type { RuntimeWorld } from './objectRegistry';

const IDENTITY_TRANSFORM: NodeTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }
};

export interface NodePivotBindings {
  world: RuntimeWorld;
  wrapNode: (node: LiveNode) => Record<string, unknown>;
  resolveNode: (value: unknown) => LiveNode | undefined;
}

function isModelNode(node: LiveNode): boolean {
  return node.def.type === 'model' || node.def.type === 'agent';
}

function cloneTransform(t: NodeTransform): NodeTransform {
  return {
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z }
  };
}

function composeMatrix(t: NodeTransform): THREE.Matrix4 {
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(t.rotation.x, t.rotation.y, t.rotation.z, 'XYZ')
  );
  return new THREE.Matrix4().compose(
    new THREE.Vector3(t.position.x, t.position.y, t.position.z),
    quat,
    new THREE.Vector3(1, 1, 1)
  );
}

function decomposeMatrix(matrix: THREE.Matrix4): NodeTransform {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(pos, quat, scale);
  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z }
  };
}

function applyTransform(node: LiveNode, transform: NodeTransform): void {
  node.setPosition(transform.position.x, transform.position.y, transform.position.z);
  node.setRotation(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  notifyChanged(node, 'Position');
  notifyChanged(node, 'Rotation');
}

function collectDescendants(root: LiveNode): LiveNode[] {
  const result: LiveNode[] = [];
  const seen = new Set<string>([root.id]);
  const stack = [...root.children];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    result.push(current);
    for (const child of current.children) stack.push(child);
  }
  return result;
}

/** Computes the world-space AABB centre of all non-model descendants. */
function getBoundsPivot(model: LiveNode): NodeTransform {
  const parts = collectDescendants(model).filter((d) => d.def.type !== 'model');
  if (parts.length === 0) {
    return { position: { ...model.position }, rotation: { ...model.rotation } };
  }
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const part of parts) {
    const mat = composeMatrix({ position: part.position, rotation: part.rotation });
    const hx = Math.max(0.01, part.scale.x / 2);
    const hy = Math.max(0.01, part.scale.y / 2);
    const hz = Math.max(0.01, part.scale.z / 2);
    for (const sx of [-hx, hx]) {
      for (const sy of [-hy, hy]) {
        for (const sz of [-hz, hz]) {
          corner.set(sx, sy, sz).applyMatrix4(mat);
          box.expandByPoint(corner);
        }
      }
    }
  }
  const center = box.getCenter(new THREE.Vector3());
  return {
    position: { x: center.x, y: center.y, z: center.z },
    rotation: { x: 0, y: 0, z: 0 }
  };
}

/** Resolves the current world-space pivot transform for a part or model. */
export function getPivotTransform(node: LiveNode, world: RuntimeWorld): NodeTransform {
  if (!isModelNode(node)) {
    const base = composeMatrix({ position: node.position, rotation: node.rotation });
    if (!node.pivotOffset) return { position: { ...node.position }, rotation: { ...node.rotation } };
    return decomposeMatrix(base.multiply(composeMatrix(node.pivotOffset)));
  }
  if (node.primaryPartId) {
    const primary = world.get(node.primaryPartId);
    if (primary) return getPivotTransform(primary, world);
  }
  return node.worldPivot ? cloneTransform(node.worldPivot) : getBoundsPivot(node);
}

/** Moves a part or rigidly transforms a model subtree so its pivot matches `target`. */
export function pivotNodeTo(node: LiveNode, target: NodeTransform, world: RuntimeWorld): void {
  const mNew = composeMatrix(target);
  if (!isModelNode(node)) {
    const mPart = node.pivotOffset
      ? mNew.multiply(composeMatrix(node.pivotOffset).invert())
      : mNew;
    applyTransform(node, decomposeMatrix(mPart));
    return;
  }
  const mOld = composeMatrix(getPivotTransform(node, world));
  const mDelta = mNew.clone().multiply(mOld.invert());
  for (const targetNode of [node, ...collectDescendants(node)]) {
    const mUpdated = mDelta.clone().multiply(composeMatrix({
      position: targetNode.position,
      rotation: targetNode.rotation
    }));
    applyTransform(targetNode, decomposeMatrix(mUpdated));
  }
  node.worldPivot = cloneTransform(target);
}

/** Attaches `GetPivot`, `PivotTo`, `PivotOffset`, `WorldPivot`, and `PrimaryPart` onto a Lua proxy. */
export function attachNodePivot(
  proxy: Record<string, unknown>,
  node: LiveNode,
  bindings: NodePivotBindings
): void {
  const toCFrame = (t: NodeTransform) => makeCFrameValue(t.position, rotationMatrix(t.rotation));

  proxy.GetPivot = () => toCFrame(getPivotTransform(node, bindings.world));
  proxy.PivotTo = (value: unknown) => {
    const parsed = readCFrameValue(value);
    if (parsed) pivotNodeTo(node, parsed, bindings.world);
  };

  if (isModelNode(node)) {
    defineAlias(
      proxy,
      ['WorldPivot', 'worldPivot'],
      () => toCFrame(node.worldPivot ? cloneTransform(node.worldPivot) : getBoundsPivot(node)),
      (value) => {
        const parsed = readCFrameValue(value);
        if (!parsed) return;
        node.worldPivot = cloneTransform(parsed);
        notifyChanged(node, 'WorldPivot');
      }
    );
    defineAlias(
      proxy,
      ['PrimaryPart', 'primaryPart'],
      () => {
        const primary = node.primaryPartId ? bindings.world.get(node.primaryPartId) : undefined;
        return primary ? bindings.wrapNode(primary) : undefined;
      },
      (value) => {
        const target = bindings.resolveNode(value);
        node.primaryPartId = target ? target.id : null;
        notifyChanged(node, 'PrimaryPart');
      }
    );
    return;
  }

  defineAlias(
    proxy,
    ['PivotOffset', 'pivotOffset'],
    () => toCFrame(node.pivotOffset ?? IDENTITY_TRANSFORM),
    (value) => {
      const parsed = readCFrameValue(value);
      if (!parsed) return;
      node.pivotOffset = cloneTransform(parsed);
      notifyChanged(node, 'PivotOffset');
    }
  );
}
