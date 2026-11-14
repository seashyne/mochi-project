// Runtime world registry: owns every live node, keeps the scene graph and the physics
// world in sync, and answers the lookups scripts do (`world.findPart`, `Instance.new`).

import * as THREE from 'three';
import { PhysicsVec3, PhysicsWorld, RigidBody } from '../physics';
import { StudioObject } from '../studio/types';
import { LiveNode } from './liveNode';
import { buildLiveNode, buildNodeDef } from './nodeFactory';
import { NodeSpawnSpec, RuntimeVec3 } from './types';

export interface RuntimeWorldHooks {
  onNodeCreated?: (node: LiveNode) => void;
  onNodeDestroyed?: (node: LiveNode) => void;
}

export class RuntimeWorld {
  private readonly nodes = new Map<string, LiveNode>();
  private readonly bodyIndex = new Map<string, LiveNode>();
  private sequence = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly onNodeError?: (node: LiveNode, error: unknown) => void,
    private readonly hooks: RuntimeWorldHooks = {}
  ) {}

  /** Registers an existing Studio object as a live node. */
  spawn(def: StudioObject, options: { dynamic?: boolean } = {}): LiveNode {
    const node = buildLiveNode(def);
    node.dynamic = Boolean(options.dynamic);
    this.bindErrorHook(node);
    this.scene.add(node.mesh);
    if (node.body) this.physics.addBody(node.body);
    this.nodes.set(node.id, node);
    if (node.body) this.bodyIndex.set(node.body.id, node);
    if (def.parentId) this.linkToParent(node, def.parentId);
    this.hooks.onNodeCreated?.(node);
    return node;
  }

  /**
   * Wraps a mesh/collider that a world loader already added to the scene.
   * Used by the published-game path so scripts drive the loaded world instead of a copy.
   */
  adopt(def: StudioObject, mesh: THREE.Object3D | null, body: RigidBody | null): LiveNode {
    const node = new LiveNode(def, mesh ?? new THREE.Object3D(), body);
    node.owned = false;
    this.bindErrorHook(node);
    this.nodes.set(node.id, node);
    if (body) this.bodyIndex.set(body.id, node);
    if (def.parentId) this.linkToParent(node, def.parentId);
    return node;
  }

  /** Creates a brand-new node at runtime (`Instance.new`, `world.createPart`). */
  create(spec: NodeSpawnSpec): LiveNode {
    this.sequence += 1;
    const id = `inst_${spec.type}_${Date.now().toString(36)}_${this.sequence}`;
    return this.spawn(buildNodeDef(spec, id), { dynamic: true });
  }

  get(id: string): LiveNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Casts a ray and resolves the node it hit. Lives here because this registry owns the
   * body-to-node map; a caller that only had the physics world could not name the hit.
   */
  raycast(
    origin: PhysicsVec3,
    direction: PhysicsVec3,
    maxDistance: number,
    ignoreBodyId?: string | null
  ) {
    const hit = this.physics.raycast(origin, direction, maxDistance, {
      ignoreBodyId: ignoreBodyId ?? null
    });
    return {
      hit: hit.hit,
      point: hit.point,
      normal: hit.normal,
      distance: hit.distance,
      node: hit.bodyId ? this.getByBodyId(hit.bodyId) : undefined
    };
  }

  /** Resolves the node that owns a physics body id (trigger dispatch). */
  getByBodyId(bodyId: string): LiveNode | undefined {
    return this.bodyIndex.get(bodyId);
  }

  getAll(): LiveNode[] {
    return Array.from(this.nodes.values());
  }

  count(): number {
    return this.nodes.size;
  }

  findByName(name: string): LiveNode | undefined {
    const needle = String(name ?? '').toLowerCase();
    for (const node of this.nodes.values()) {
      if (node.def.name.toLowerCase() === needle) return node;
    }
    return undefined;
  }

  findByType(type: StudioObject['type']): LiveNode[] {
    return this.getAll().filter((node) => node.def.type === type);
  }

  /** Links children declared through `parentId` once every node exists. */
  relinkParents(): void {
    for (const node of this.nodes.values()) {
      node.parent = null;
      node.children.length = 0;
    }
    for (const node of this.nodes.values()) {
      if (node.def.parentId) this.linkToParent(node, node.def.parentId);
    }
  }

  setParent(childId: string, parentId: string | null): boolean {
    const child = this.nodes.get(childId);
    if (!child) return false;
    if (!parentId) {
      child.parent = null;
      child.def.parentId = null;
      return true;
    }
    if (parentId === childId) return false;
    return this.linkToParent(child, parentId);
  }

  /** Removes a node, its children and its collider from the world. */
  destroy(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    for (const child of [...node.children]) this.destroy(child.id);
    this.nodes.delete(id);
    if (node.body) {
      this.physics.removeBody(node.body.id);
      this.bodyIndex.delete(node.body.id);
    }
    this.hooks.onNodeDestroyed?.(node);
    node.dispose();
    if (node.parent) {
      const siblings = node.parent.children;
      const index = siblings.indexOf(node);
      if (index >= 0) siblings.splice(index, 1);
      node.parent = null;
    }
    return true;
  }

  /** Non-dynamic bodies follow the data model (scripts move them); call before stepping. */
  applyAuthoritativeTransforms(): void {
    for (const node of this.nodes.values()) node.applyAuthoritativeTransform();
  }

  /** Dynamic bodies own their transform; copy it back after stepping. */
  syncFromPhysics(): void {
    for (const node of this.nodes.values()) node.syncFromBody();
  }

  setGravity(x: number, y: number, z: number): void {
    this.physics.gravity.x = Number(x) || 0;
    this.physics.gravity.y = Number(y) || 0;
    this.physics.gravity.z = Number(z) || 0;
  }

  getGravity(): RuntimeVec3 {
    return { ...this.physics.gravity };
  }

  clear(): void {
    for (const node of this.nodes.values()) {
      if (node.body) this.physics.removeBody(node.body.id);
      node.dispose();
    }
    this.nodes.clear();
    this.bodyIndex.clear();
  }

  private bindErrorHook(node: LiveNode): void {
    if (!this.onNodeError) return;
    const report = this.onNodeError;
    node.onError = (error) => report(node, error);
  }

  private linkToParent(child: LiveNode, parentId: string): boolean {
    const parent = this.nodes.get(parentId);
    if (!parent || parent === child) return false;
    if (child.parent) {
      const previous = child.parent.children.indexOf(child);
      if (previous >= 0) child.parent.children.splice(previous, 1);
    }
    child.parent = parent;
    child.def.parentId = parent.id;
    if (!parent.children.includes(child)) parent.children.push(child);
    return true;
  }
}
