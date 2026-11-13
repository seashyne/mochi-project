import * as THREE from 'three';
import { PhysicsWorld, RigidBody } from '../physics';
import { StudioObject, StudioSceneSnapshot, StudioVec3 } from '../studio/types';
import { attachModelObject } from './modelCollider';
import { registerCullTarget } from './distanceCulling';
import { createInstancedBatches, instancedKindFor } from './instancedBatch';
import { createObjectBody } from './sceneBodies';
import { collectBindings, SceneBinding } from './sceneBindings';
import { normalizeConstraint, normalizeParticle } from '../studio/advancedTypes';
import { normalizeTerrainData } from '../studio/terrainCodec';
import { buildTerrainBodies } from '../studio/terrainBodies';

export interface WorldLoadResult {
  success: boolean;
  objectsCount: number;
  spawnPoint: { x: number; y: number; z: number };
  objects: StudioObject[];
  meshes: THREE.Object3D[];
  bodies: RigidBody[];
  bindings: Map<string, SceneBinding>;
  ready: Promise<void>;
  dispose: () => void;
}

export const DEFAULT_STARTER_OBJECTS: StudioObject[] = [
  { id: 'starter_spawn', name: 'Spawn Point', type: 'spawn', position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 4, y: 0.2, z: 4 }, color: '#00a2ff' },
  { id: 'starter_platform_1', name: 'Starter Platform 1', type: 'platform', position: { x: 0, y: 1.0, z: 6 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 4, y: 0.5, z: 4 }, color: '#6366f1' },
  { id: 'starter_jump_pad', name: 'Boost Pad', type: 'jump_pad', position: { x: 0, y: 1.3, z: 6 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 0.2, z: 2 }, color: '#10b981' },
  { id: 'starter_platform_2', name: 'Elevated Platform', type: 'platform', position: { x: 0, y: 3.5, z: 14 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 5, y: 0.5, z: 5 }, color: '#38bdf8' },
  { id: 'starter_coin', name: 'Bonus Coin', type: 'coin', position: { x: 0, y: 4.5, z: 14 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 0.2, z: 1 }, color: '#fbbf24' },
  { id: 'starter_hazard', name: 'Lava Hazard', type: 'hazard', position: { x: 0, y: -0.5, z: 10 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 16, y: 0.4, z: 20 }, color: '#ef4444' }
];

const DEFAULT_POS_ROT: StudioVec3 = { x: 0, y: 0, z: 0 };
const DEFAULT_SCALE: StudioVec3 = { x: 1, y: 1, z: 1 };

function sanitizeVec3(val: unknown, fallback: StudioVec3): StudioVec3 {
  if (!val || typeof val !== 'object') {
    return { ...fallback };
  }
  const rec = val as Record<string, unknown>;
  return {
    x: typeof rec.x === 'number' && Number.isFinite(rec.x) ? rec.x : fallback.x,
    y: typeof rec.y === 'number' && Number.isFinite(rec.y) ? rec.y : fallback.y,
    z: typeof rec.z === 'number' && Number.isFinite(rec.z) ? rec.z : fallback.z
  };
}

function sanitizeAssetFields(rec: Record<string, unknown>): Partial<StudioObject> {
  const assetUrl = typeof rec.assetUrl === 'string' && rec.assetUrl ? rec.assetUrl : undefined;
  if (!assetUrl) return {};
  return {
    assetUrl,
    ...(typeof rec.assetKey === 'string' ? { assetKey: rec.assetKey } : {}),
    ...(typeof rec.assetHash === 'string' ? { assetHash: rec.assetHash } : {}),
    ...(typeof rec.assetSizeBytes === 'number' ? { assetSizeBytes: rec.assetSizeBytes } : {}),
    ...(typeof rec.assetContentType === 'string'
      ? { assetContentType: rec.assetContentType }
      : {})
  };
}

function sanitizeStudioObject(raw: unknown, index: number): StudioObject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `obj_${index}`;
  const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : `Object ${index + 1}`;
  const type = typeof rec.type === 'string' ? (rec.type as StudioObject['type']) : 'block';
  const color = typeof rec.color === 'string' && rec.color.trim() ? rec.color.trim() : '#6366f1';
  const position = sanitizeVec3(rec.position, DEFAULT_POS_ROT);
  const rotation = sanitizeVec3(rec.rotation, DEFAULT_POS_ROT);
  const scale = sanitizeVec3(rec.scale, DEFAULT_SCALE);
  const luaScript = typeof rec.luaScript === 'string' ? rec.luaScript : undefined;

  return {
    id,
    name,
    type,
    position,
    rotation,
    scale,
    color,
    ...(luaScript ? { luaScript } : {}),
    ...(typeof rec.canCollide === 'boolean' ? { canCollide: rec.canCollide } : {}),
    ...(typeof rec.anchored === 'boolean' ? { anchored: rec.anchored } : {}),
    ...sanitizeAssetFields(rec),
    ...sanitizeAdvancedFields(rec)
  };
}

/** Validates advanced payloads so a hostile manifest cannot smuggle huge grids. */
function sanitizeAdvancedFields(rec: Record<string, unknown>): Partial<StudioObject> {
  const terrain = normalizeTerrainData(rec.terrain);
  const constraint = normalizeConstraint(rec.constraint);
  return {
    ...(terrain ? { terrain } : {}),
    ...(constraint ? { constraint } : {}),
    ...(rec.particle && typeof rec.particle === 'object' ? { particle: normalizeParticle(rec.particle) } : {})
  };
}

export function parseManifestObjects(manifest: string | StudioSceneSnapshot | unknown): StudioObject[] {
  if (!manifest) return DEFAULT_STARTER_OBJECTS;

  let parsed: unknown = manifest;
  if (typeof manifest === 'string') {
    try {
      parsed = JSON.parse(manifest);
    } catch {
      return DEFAULT_STARTER_OBJECTS;
    }
  }

  let rawList: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.objects)) {
      rawList = record.objects;
    } else if (record.scenes && typeof record.scenes === 'object') {
      const scenes = record.scenes as Record<string, { objects?: unknown[] }>;
      const mainScene = scenes['scenes/main.json'] || Object.values(scenes)[0];
      if (mainScene && Array.isArray(mainScene.objects)) {
        rawList = mainScene.objects;
      }
    }
  }

  if (!rawList || rawList.length === 0) {
    return DEFAULT_STARTER_OBJECTS;
  }

  const sanitized: StudioObject[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = sanitizeStudioObject(rawList[i], i);
    if (item) {
      sanitized.push(item);
    }
  }

  return sanitized.length > 0 ? sanitized : DEFAULT_STARTER_OBJECTS;
}

// Re-exported so existing importers keep their import path.
import { buildObjectMesh } from './objectMeshes';

export { buildObjectMesh };

export function loadWorldFromManifest(
  scene: THREE.Scene,
  manifest: string | StudioSceneSnapshot | unknown,
  physicsWorld: PhysicsWorld
): WorldLoadResult {
  const objects = parseManifestObjects(manifest);
  const meshes: THREE.Object3D[] = [];
  const bodies: RigidBody[] = [];
  const cancels: Array<() => void> = [];
  const pending: Promise<void>[] = [];
  let disposed = false;
  let spawnPoint = { x: 0, y: 1.0, z: 0 };

  // Scripted objects get their own mesh: instanced batches cannot be moved or hidden
  // per instance, and scripts need both.
  const isScripted = (obj: StudioObject) => Boolean(obj.luaScript?.trim());
  createInstancedBatches(objects.filter((obj) => !isScripted(obj)))
    .forEach((batch) => { scene.add(batch); meshes.push(batch); });

  for (const obj of objects) {
    if (!instancedKindFor(obj.type) || isScripted(obj)) {
      const mesh = buildObjectMesh(obj);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
      mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
      mesh.userData = { id: obj.id, type: obj.type };

      scene.add(mesh);
      meshes.push(mesh);
      if (obj.type === 'model') {
        cancels.push(attachModelObject(mesh, obj, physicsWorld, bodies, () => disposed, pending));
        cancels.push(registerCullTarget(mesh));
      }
    }

    if (obj.type === 'spawn') {
      spawnPoint = {
        x: obj.position.x,
        y: obj.position.y + obj.scale.y / 2 + 1.0,
        z: obj.position.z
      };
    }

    const body = createObjectBody(obj);
    if (body) {
      physicsWorld.addBody(body);
      bodies.push(body);
    }
    if (obj.type === 'terrain' && obj.terrain) {
      for (const b of buildTerrainBodies(obj)) { physicsWorld.addBody(b); bodies.push(b); }
    }
  }

  const dispose = () => {
    disposed = true;
    cancels.forEach((cancel) => cancel());
    cancels.length = 0;
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
    for (const body of bodies) {
      physicsWorld.removeBody(body.id);
    }
    meshes.length = 0;
    bodies.length = 0;
  };
  const ready = Promise.all(pending).then(() => undefined);
  void ready.catch(() => {});
  return {
    ready,
    success: true,
    objectsCount: objects.length,
    spawnPoint,
    objects,
    meshes,
    bodies,
    bindings: collectBindings(objects, meshes, bodies),
    dispose
  };
}
