// Translates declarative specs (Studio objects, Instance.new calls) into live nodes:
// builds the mesh, derives a collider, and keeps the genre-standard class aliases in one place.

import * as THREE from 'three';
import { RigidBody } from '../physics';
import { buildObjectMesh } from '../studio/studioMeshBuilder';
import { OBJECT_TYPE_DEFAULTS, StudioObject, StudioObjectType } from '../studio/types';
import { LiveNode } from './liveNode';
import { NodeSpawnSpec, RuntimeVec3 } from './types';

const CLASS_ALIASES: Record<string, StudioObjectType> = {
  part: 'block',
  block: 'block',
  brick: 'block',
  cube: 'block',
  meshpart: 'block',
  sphere: 'sphere',
  ball: 'sphere',
  cylinder: 'cylinder',
  pillar: 'cylinder',
  column: 'cylinder',
  tube: 'cylinder',
  wedge: 'ramp',
  ramp: 'ramp',
  slope: 'ramp',
  platform: 'platform',
  movingplatform: 'platform',
  coin: 'coin',
  collectible: 'coin',
  jumppad: 'jump_pad',
  trampoline: 'jump_pad',
  hazard: 'hazard',
  lava: 'hazard',
  killbrick: 'hazard',
  spawn: 'spawn',
  spawnpoint: 'spawn',
  model: 'model',
  folder: 'model',
  terrain: 'terrain',
  constraint: 'constraint',
  joint: 'constraint',
  particle: 'particle',
  emitter: 'particle'
};

/** Maps `Instance.new("JumpPad")` style names onto Studio object types. */
export function resolveLuaClass(className: string): StudioObjectType {
  const key = String(className ?? '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  return CLASS_ALIASES[key] ?? 'block';
}

export function buildNodeDef(spec: NodeSpawnSpec, id: string): StudioObject {
  const defaults = OBJECT_TYPE_DEFAULTS[spec.type];
  const position: RuntimeVec3 = {
    x: spec.position?.x ?? 0,
    y: spec.position?.y ?? defaults.defaultScale.y / 2,
    z: spec.position?.z ?? 0
  };
  return {
    id,
    name: spec.name?.trim() || `${defaults.label.replace(/\s+/g, '')}_${id.slice(-4)}`,
    type: spec.type,
    position,
    rotation: {
      x: spec.rotation?.x ?? 0,
      y: spec.rotation?.y ?? 0,
      z: spec.rotation?.z ?? 0
    },
    scale: {
      x: spec.scale?.x ?? defaults.defaultScale.x,
      y: spec.scale?.y ?? defaults.defaultScale.y,
      z: spec.scale?.z ?? defaults.defaultScale.z
    },
    color: spec.color ?? defaults.defaultColor,
    material: spec.material ?? 'plastic',
    anchored: spec.anchored ?? true,
    canCollide: spec.canCollide ?? true,
    parentId: spec.parentId ?? null,
    luaScript: spec.script
  };
}

function halfExtentsOf(def: StudioObject): RuntimeVec3 {
  return {
    x: Math.max(0.05, def.scale.x / 2),
    y: Math.max(0.05, def.scale.y / 2),
    z: Math.max(0.05, def.scale.z / 2)
  };
}

/** A ramp walks on its slope, so its collider is a thin box laid along the hypotenuse. */
function rampSlopeCollider(def: StudioObject): { halfExtents: RuntimeVec3; rotation: RuntimeVec3 } {
  const sx = Math.max(0.1, def.scale.x);
  const sy = Math.max(0.1, def.scale.y);
  const sz = Math.max(0.1, def.scale.z);
  const slopeLength = Math.hypot(sx, sy);
  const tilt = Math.atan2(sy, sx);

  const quaternion = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(def.rotation.x, def.rotation.y, def.rotation.z, 'XYZ'))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');

  return {
    halfExtents: {
      x: Math.max(0.05, slopeLength / 2),
      y: 0.15,
      z: Math.max(0.05, sz / 2)
    },
    rotation: { x: euler.x, y: euler.y, z: euler.z }
  };
}

/** Derives the collider for a node, mirroring the behaviour of the Studio playtest rules. */
export function buildNodeBody(def: StudioObject): RigidBody | null {
  if (def.type === 'model' || def.type === 'spawn') return null;
  // Terrain owns a set of static boxes; constraints and emitters have no collider.
  if (def.type === 'terrain' || def.type === 'constraint' || def.type === 'particle') return null;
  if (def.canCollide === false) return null;

  const base = {
    id: def.id,
    position: { ...def.position },
    rotation: { ...def.rotation }
  };

  if (def.type === 'coin') {
    return new RigidBody({
      ...base,
      type: 'static',
      isTrigger: true,
      shape: { type: 'sphere', radius: Math.max(0.5, def.scale.x * 0.6) }
    });
  }

  if (def.type === 'sphere') {
    const dynamic = def.anchored === false;
    return new RigidBody({
      ...base,
      type: dynamic ? 'dynamic' : 'static',
      mass: dynamic ? Math.max(0.2, def.scale.x * def.scale.y * def.scale.z) : undefined,
      shape: { type: 'sphere', radius: Math.max(0.05, Math.max(def.scale.x, def.scale.y, def.scale.z) / 2) }
    });
  }

  if (def.type === 'cylinder') {
    const dynamic = def.anchored === false;
    return new RigidBody({
      ...base,
      type: dynamic ? 'dynamic' : 'static',
      mass: dynamic ? Math.max(0.2, def.scale.x * def.scale.y * def.scale.z) : undefined,
      shape: {
        type: 'cylinder',
        radius: Math.max(0.05, Math.max(def.scale.x, def.scale.z) / 2),
        halfHeight: Math.max(0.05, def.scale.y / 2)
      }
    });
  }

  if (def.type === 'ramp') {
    const slope = rampSlopeCollider(def);
    return new RigidBody({
      ...base,
      rotation: slope.rotation,
      type: 'static',
      shape: { type: 'box', halfExtents: slope.halfExtents }
    });
  }

  const halfExtents = halfExtentsOf(def);

  if (def.type === 'jump_pad' || def.type === 'hazard') {
    return new RigidBody({
      ...base,
      type: 'static',
      isTrigger: true,
      shape: { type: 'box', halfExtents }
    });
  }

  if (def.type === 'platform') {
    return new RigidBody({
      ...base,
      type: 'kinematic',
      shape: { type: 'box', halfExtents }
    });
  }

  const dynamic = def.anchored === false;
  return new RigidBody({
    ...base,
    type: dynamic ? 'dynamic' : 'static',
    mass: dynamic ? Math.max(0.2, def.scale.x * def.scale.y * def.scale.z) : undefined,
    shape: { type: 'box', halfExtents }
  });
}

/** Builds the runtime node for a Studio object, ready to be added to a scene. */
export function buildLiveNode(def: StudioObject): LiveNode {
  const mesh = buildObjectMesh(def);
  const body = buildNodeBody(def);
  return new LiveNode(def, mesh, body);
}
