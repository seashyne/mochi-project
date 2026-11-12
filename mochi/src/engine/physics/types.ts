// 3D Physics Engine type definitions, shapes, and collision manifold schemas
// Clean-room deterministic 60Hz physics interfaces

export interface PhysicsVec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  min: PhysicsVec3;
  max: PhysicsVec3;
}

export type BodyType = 'dynamic' | 'static' | 'kinematic';

export type ColliderShapeType = 'box' | 'sphere' | 'cylinder';

export interface BoxShape {
  type: 'box';
  halfExtents: PhysicsVec3;
}

export interface SphereShape {
  type: 'sphere';
  radius: number;
}

export interface CylinderShape {
  type: 'cylinder';
  radius: number;
  halfHeight: number;
}

export type ColliderShape = BoxShape | SphereShape | CylinderShape;

export interface PhysicsMaterial {
  friction: number;
  restitution: number;
  density?: number;
}

export interface RigidBodyOptions {
  id?: string;
  type?: BodyType;
  position?: Partial<PhysicsVec3>;
  velocity?: Partial<PhysicsVec3>;
  /** Euler XYZ radians; oriented boxes use it for narrowphase and bounds. */
  rotation?: Partial<PhysicsVec3>;
  mass?: number;
  shape: ColliderShape;
  material?: Partial<PhysicsMaterial>;
  linearDamping?: number;
  isTrigger?: boolean;
  userData?: Record<string, unknown>;
}

export interface CollisionManifold {
  bodyA: RigidBodyOptions & { id: string };
  bodyB: RigidBodyOptions & { id: string };
  normal: PhysicsVec3;
  depth: number;
  contactPoint: PhysicsVec3;
}

export interface RaycastHit {
  hit: boolean;
  point: PhysicsVec3;
  normal: PhysicsVec3;
  distance: number;
  bodyId: string | null;
}

export interface TriggerEvent {
  triggerBodyId: string;
  visitorBodyId: string;
  visitorPosition: PhysicsVec3;
  type: 'enter' | 'stay' | 'exit';
}
