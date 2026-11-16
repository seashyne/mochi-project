// A live node is the runtime twin of a StudioObject: it owns a Three.js mesh and a
// physics body, and it is the object Lua scripts actually hold a reference to.

import * as THREE from 'three';
import { RigidBody } from '../physics';
import { StudioObject } from '../studio/types';
import { RuntimeVec3 } from './types';

/** Touch callbacks receive the Lua player proxy, not the raw controller. */
export type LuaPlayerProxy = Record<string, unknown>;
export type TouchHandler = (player: LuaPlayerProxy) => void;
export type UpdateHandler = (deltaTime: number) => void;

export class LiveNode {
  readonly id: string;
  readonly def: StudioObject;
  readonly mesh: THREE.Object3D;
  body: RigidBody | null;
  parent: LiveNode | null = null;
  readonly children: LiveNode[] = [];
  visible = true;
  destroyed = false;
  /** False when the mesh/collider belong to a loaded world that the runtime merely adopts. */
  owned = true;
  /** True for nodes created at runtime (`Instance.new`), which survive world resyncs. */
  dynamic = false;
  /** True when the node was spawned by a peer's world op, so it is never re-broadcast. */
  remote = false;
  /** Cached Lua-facing proxy so `a == b` holds for the same node. */
  luaProxy: Record<string, unknown> | null = null;
  /** Routes handler failures to the session console instead of only the browser log. */
  onError: ((error: unknown) => void) | null = null;

  private readonly touchHandlers: TouchHandler[] = [];
  private readonly touchEndedHandlers: TouchHandler[] = [];
  private readonly updateHandlers: UpdateHandler[] = [];
  /** Last transform pushed to the mesh/body, so idle nodes cost nothing per frame. */
  private lastTransform: number[] | null = null;

  constructor(def: StudioObject, mesh: THREE.Object3D, body: RigidBody | null = null) {
    this.id = def.id;
    this.def = def;
    this.mesh = mesh;
    this.body = body;
    this.applyTransform();
  }

  get name(): string {
    return this.def.name;
  }

  set name(value: string) {
    this.def.name = String(value ?? '');
    this.mesh.name = this.def.name;
  }

  get type() {
    return this.def.type;
  }

  get position(): RuntimeVec3 {
    return this.def.position;
  }

  /** Read access matching `setPosition`, so a node can drive a navigator. */
  getPosition(): RuntimeVec3 {
    return this.def.position;
  }

  set position(value: RuntimeVec3) {
    this.setPosition(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
  }

  get rotation(): RuntimeVec3 {
    return this.def.rotation;
  }

  set rotation(value: RuntimeVec3) {
    this.setRotation(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
  }

  get scale(): RuntimeVec3 {
    return this.def.scale;
  }

  set scale(value: RuntimeVec3) {
    this.setScale(value?.x ?? 1, value?.y ?? 1, value?.z ?? 1);
  }

  get anchored(): boolean {
    return this.def.anchored !== false;
  }

  set anchored(value: boolean) {
    this.def.anchored = Boolean(value);
    if (this.body) this.body.type = this.def.anchored ? 'static' : 'dynamic';
  }

  get touchHandlerCount(): number {
    return this.touchHandlers.length;
  }

  get touchEndedHandlerCount(): number {
    return this.touchEndedHandlers.length;
  }

  get updateHandlerCount(): number {
    return this.updateHandlers.length;
  }

  setPosition(x: number, y: number, z: number): void {
    const p = this.def.position;
    p.x = Number(x) || 0;
    p.y = Number(y) || 0;
    p.z = Number(z) || 0;
    this.mesh.position.set(p.x, p.y, p.z);
    if (this.body) {
      this.body.setPosition(p.x, p.y, p.z);
      this.body.updateAABB();
    }
  }

  setRotation(x: number, y: number, z: number): void {
    const r = this.def.rotation;
    r.x = Number(x) || 0;
    r.y = Number(y) || 0;
    r.z = Number(z) || 0;
    this.mesh.rotation.set(r.x, r.y, r.z);
    this.body?.setRotation(r.x, r.y, r.z);
  }

  setScale(x: number, y: number, z: number): void {
    const s = this.def.scale;
    s.x = Math.max(0.01, Number(x) || 1);
    s.y = Math.max(0.01, Number(y) || 1);
    s.z = Math.max(0.01, Number(z) || 1);
    this.mesh.scale.set(s.x, s.y, s.z);
  }

  setVisible(visible: boolean): void {
    this.visible = Boolean(visible);
    this.mesh.visible = this.visible;
  }

  setColor(color: string): void {
    this.def.color = color;
    this.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      const apply = (mat: THREE.Material) => {
        const standard = mat as THREE.MeshStandardMaterial;
        if (standard.color?.isColor) {
          standard.color.set(color);
          if (standard.emissive?.isColor && standard.emissiveIntensity > 0) {
            standard.emissive.set(color);
          }
        }
      };
      if (Array.isArray(material)) material.forEach(apply);
      else apply(material);
    });
  }

  addTouchHandler(handler: TouchHandler): void {
    this.touchHandlers.push(handler);
  }

  addTouchEndedHandler(handler: TouchHandler): void {
    this.touchEndedHandlers.push(handler);
  }

  addUpdateHandler(handler: UpdateHandler): void {
    this.updateHandlers.push(handler);
  }

  emitTouchEnded(player: LuaPlayerProxy): void {
    for (const handler of [...this.touchEndedHandlers]) {
      try {
        handler(player);
      } catch (err) {
        this.reportError(err);
      }
    }
  }

  emitTouch(player: LuaPlayerProxy): void {
    for (const handler of [...this.touchHandlers]) {
      try {
        handler(player);
      } catch (err) {
        this.reportError(err);
      }
    }
  }

  dispatchUpdate(dt: number): void {
    if (this.updateHandlers.length === 0) return;
    for (const handler of [...this.updateHandlers]) {
      try {
        handler(dt);
      } catch (err) {
        this.reportError(err);
      }
    }
  }

  setVelocity(x: number, y: number, z: number): void {
    this.body?.setVelocity(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  }

  applyImpulse(x: number, y: number, z: number): void {
    this.body?.applyImpulse({ x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 });
  }

  /** Copies the data model onto the mesh; scripts mutate `position.x` in place. */
  syncMeshFromDef(): void {
    const { position, rotation, scale } = this.def;
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    this.mesh.scale.set(scale.x, scale.y, scale.z);
  }

  /** Pushes script-authored transforms into non-dynamic bodies before the solver runs. */
  applyAuthoritativeTransform(): void {
    const { position, rotation, scale } = this.def;
    const signature = [position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, scale.x, scale.y, scale.z];
    const last = this.lastTransform;
    if (last && last.length === signature.length && last.every((value, index) => value === signature[index])) {
      return;
    }
    this.lastTransform = signature;
    this.syncMeshFromDef();
    if (!this.body || this.body.type === 'dynamic') return;
    this.body.setPosition(position.x, position.y, position.z);
    this.body.setRotation(rotation.x, rotation.y, rotation.z);
    this.body.updateAABB();
  }

  /** Pulls solver-owned positions back into the data model and mesh. */
  syncFromBody(): void {
    if (!this.body || this.body.type !== 'dynamic') return;
    const p = this.def.position;
    p.x = this.body.position.x;
    p.y = this.body.position.y;
    p.z = this.body.position.z;
    this.mesh.position.set(p.x, p.y, p.z);
  }

  private applyTransform(): void {
    const { position, rotation, scale } = this.def;
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    this.mesh.scale.set(scale.x, scale.y, scale.z);
    this.mesh.name = this.def.name;
    this.mesh.userData = { ...this.mesh.userData, id: this.def.id, type: this.def.type };
  }

  private reportError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
      return;
    }
    console.error(`Handler failed on ${this.def.name}:`, error);
  }

  dispose(): void {
    this.destroyed = true;
    if (this.owned) {
      this.mesh.removeFromParent();
      this.mesh.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((mat) => mat.dispose());
        else material?.dispose?.();
      });
    }
    this.touchHandlers.length = 0;
    this.updateHandlers.length = 0;
  }
}
