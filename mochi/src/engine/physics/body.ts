// 3D Rigid Body representation with semi-implicit Euler integration
// Supports dynamic, static, and kinematic physics bodies with custom restitution and friction

import { BodyType, ColliderShape, PhysicsMaterial, PhysicsVec3, RigidBodyOptions } from './types';
import { Vec3Math } from './math';
import { AABB, ColliderUtils } from './collider';
import { isIdentityRotation, orientedBoxAABB, rotationMatrix } from './oriented';

let nextBodyId = 1;

export class RigidBody {
  public readonly id: string;
  public type: BodyType;
  public position: PhysicsVec3;
  public prevPosition: PhysicsVec3;
  public velocity: PhysicsVec3;
  public force: PhysicsVec3;
  public mass: number;
  public invMass: number;
  public shape: ColliderShape;
  public material: PhysicsMaterial;
  public linearDamping: number;
  public isTrigger: boolean;
  public userData: Record<string, unknown>;
  /** Euler XYZ radians. Only box colliders use it for narrowphase orientation. */
  public rotation: PhysicsVec3;

  private aabb: AABB;
  private rotationMat: number[] | null = null;

  constructor(options: RigidBodyOptions) {
    this.id = options.id || `body_${nextBodyId++}`;
    this.type = options.type || 'dynamic';
    this.position = {
      x: options.position?.x ?? 0,
      y: options.position?.y ?? 0,
      z: options.position?.z ?? 0
    };
    this.prevPosition = Vec3Math.clone(this.position);
    this.velocity = {
      x: options.velocity?.x ?? 0,
      y: options.velocity?.y ?? 0,
      z: options.velocity?.z ?? 0
    };
    this.force = { x: 0, y: 0, z: 0 };
    this.shape = options.shape;
    this.isTrigger = Boolean(options.isTrigger);
    this.userData = options.userData ? { ...options.userData } : {};

    // Static and kinematic bodies have 0 inverse mass (infinite effective mass)
    if (this.type === 'static' || this.type === 'kinematic') {
      this.mass = Infinity;
      this.invMass = 0;
    } else {
      this.mass = Math.max(0.001, options.mass ?? 1.0);
      this.invMass = 1 / this.mass;
    }

    this.material = {
      friction: options.material?.friction ?? 0.3,
      restitution: options.material?.restitution ?? 0.1
    };
    this.linearDamping = options.linearDamping ?? 0.02;
    this.rotation = {
      x: options.rotation?.x ?? 0,
      y: options.rotation?.y ?? 0,
      z: options.rotation?.z ?? 0
    };
    if (this.shape.type === 'box' && !isIdentityRotation(this.rotation)) {
      this.rotationMat = rotationMatrix(this.rotation);
    }
    this.aabb = this.computeAABB();
  }

  public applyForce(f: PhysicsVec3): void {
    if (this.type !== 'dynamic') return;
    this.force.x += f.x;
    this.force.y += f.y;
    this.force.z += f.z;
  }

  public applyImpulse(impulse: PhysicsVec3): void {
    if (this.type !== 'dynamic') return;
    this.velocity.x += impulse.x * this.invMass;
    this.velocity.y += impulse.y * this.invMass;
    this.velocity.z += impulse.z * this.invMass;
  }

  public setVelocity(x: number, y: number, z: number): void {
    this.velocity.x = x;
    this.velocity.y = y;
    this.velocity.z = z;
  }

  public setPosition(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.prevPosition = Vec3Math.clone(this.position);
    this.updateAABB();
  }

  public updateAABB(): void {
    this.aabb = this.computeAABB();
  }

  /** Replaces the collider orientation and refreshes the world bounds. */
  public setRotation(x: number, y: number, z: number): void {
    this.rotation.x = x;
    this.rotation.y = y;
    this.rotation.z = z;
    this.rotationMat =
      this.shape.type === 'box' && !isIdentityRotation(this.rotation)
        ? rotationMatrix(this.rotation)
        : null;
    this.updateAABB();
  }

  public get isOriented(): boolean {
    return this.rotationMat !== null;
  }

  public getRotationMatrix(): number[] | null {
    return this.rotationMat;
  }

  private computeAABB(): AABB {
    if (this.rotationMat && this.shape.type === 'box') {
      return orientedBoxAABB(this.shape.halfExtents, this.position, this.rotationMat);
    }
    return ColliderUtils.computeAABB(this.shape, this.position);
  }

  public getAABB(): AABB {
    return this.aabb;
  }

  public integrateVelocity(dt: number, gravity: PhysicsVec3): void {
    if (this.type !== 'dynamic') return;

    // Apply gravity acceleration
    this.velocity.x += (this.force.x * this.invMass + gravity.x) * dt;
    this.velocity.y += (this.force.y * this.invMass + gravity.y) * dt;
    this.velocity.z += (this.force.z * this.invMass + gravity.z) * dt;

    // Apply linear damping
    const dampingFactor = Math.max(0, 1 - this.linearDamping * dt);
    this.velocity.x *= dampingFactor;
    this.velocity.y *= dampingFactor;
    this.velocity.z *= dampingFactor;

    // Clear accumulated external forces
    this.force.x = 0;
    this.force.y = 0;
    this.force.z = 0;
  }

  public integratePosition(dt: number): void {
    if (this.type === 'static') return;

    this.prevPosition = Vec3Math.clone(this.position);
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
    this.updateAABB();
  }

  public interpolatePosition(alpha: number): PhysicsVec3 {
    return Vec3Math.lerp(this.prevPosition, this.position, alpha);
  }
}
