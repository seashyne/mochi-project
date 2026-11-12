// 3D Physics World: rigid bodies, iterative contact solving, triggers, ray queries.

import { CollisionManifold, PhysicsVec3, RaycastHit, TriggerEvent } from './types';
import { RigidBody } from './body';
import { ColliderUtils } from './collider';
import { CollisionDetector } from './collision';
import { Vec3Math } from './math';
import { SpatialHash } from './spatialHash';
import { ConstraintSolver, PhysicsConstraint } from './constraints';
import { TriggerTracker } from './triggerTracker';

export type TriggerListener = (event: TriggerEvent) => void;

export interface RaycastOptions {
  /** Body that must be ignored (typically the caster itself). */
  ignoreBodyId?: string | null;
  /** When true, trigger volumes are included in the query. Default false. */
  includeTriggers?: boolean;
}export class PhysicsWorld {
  public gravity: PhysicsVec3;

  /** Velocity solver passes per step. Higher values stabilise stacks and piles. */
  public solverIterations = 4;
  /** Positional passes; each one re-derives depth so contacts converge. */
  public positionIterations = 3;
  /** Impacts slower than this (m/s) do not bounce, which removes resting jitter. */
  public restitutionThreshold = 0.75;
  /** Penetration left untouched so contacts stay warm instead of oscillating. */
  public linearSlop = 0.005;
  /** Fraction of the remaining penetration corrected per step. */
  public baumgarte = 0.8;
  /** A body may travel at most this far (metres) inside one substep. */
  public maxSubStepDistance = 0.25;
  public maxSubSteps = 6;

  private bodies: Map<string, RigidBody> = new Map();
  private triggerListeners: Set<TriggerListener> = new Set();
  private triggers = new TriggerTracker();
  private constraintSolver = new ConstraintSolver();
  private broadphase = new SpatialHash();
  private cachedList: RigidBody[] | null = null;

  constructor(gravity: PhysicsVec3 = { x: 0, y: -18.0, z: 0 }) {
    this.gravity = { ...gravity };
  }

  public addBody(body: RigidBody): RigidBody {
    this.bodies.set(body.id, body);
    this.cachedList = null;
    return body;
  }

  public removeBody(id: string): void {
    this.bodies.delete(id);
    this.cachedList = null;
  }

  public getBody(id: string): RigidBody | undefined {
    return this.bodies.get(id);
  }

  public getAllBodies(): RigidBody[] {
    return Array.from(this.bodies.values());
  }

  public onTrigger(listener: TriggerListener): () => void {
    this.triggerListeners.add(listener);
    return () => this.triggerListeners.delete(listener);
  }

  public addConstraint(constraint: PhysicsConstraint): void {
    this.constraintSolver.add(constraint);
  }

  public removeConstraint(id: string): void {
    this.constraintSolver.remove(id);
  }

  public clearConstraints(): void {
    this.constraintSolver.clear();
  }

  public getConstraints(): PhysicsConstraint[] {
    return this.constraintSolver.list();
  }

  public clear(): void {
    this.bodies.clear();
    this.cachedList = null;
    this.triggers.clear();
    this.constraintSolver.clear();
    this.triggerListeners.clear();
    this.broadphase.clear();
  }

  public step(dt: number): void {
    const steps = this.computeSubSteps(dt);
    const h = dt / steps;
    const overlaps = new Set<string>();

    for (let i = 0; i < steps; i++) {
      this.substep(h, overlaps);
    }

    // Trigger bookkeeping runs once per step so listeners see enter/stay/exit
    // exactly as they would without substepping.
    this.triggers.commit(overlaps, this.emitTriggerEvent, (id) => this.bodies.get(id)?.position);
  }

  /** Fast bodies are split into substeps so thin walls and floors are not skipped. */
  private computeSubSteps(dt: number): number {
    let maxTravel = 0;
    for (const body of this.bodies.values()) {
      if (body.type !== 'dynamic') continue;
      const speed = Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z);
      const travel = speed * dt;
      if (travel > maxTravel) maxTravel = travel;
    }
    if (maxTravel <= this.maxSubStepDistance) return 1;
    return Math.min(this.maxSubSteps, Math.max(2, Math.ceil(maxTravel / this.maxSubStepDistance)));
  }

  private substep(dt: number, overlaps: Set<string>): void {
    const bodiesList = this.list();

    for (const body of bodiesList) body.integrateVelocity(dt, this.gravity);
    for (const body of bodiesList) body.integratePosition(dt);
    this.constraintSolver.solve(this.bodies, dt);

    const manifolds: CollisionManifold[] = [];
    this.broadphase.rebuild(bodiesList);

    this.broadphase.forEachPair((a, b) => {
      if (!ColliderUtils.testAABBOverlap(a.getAABB(), b.getAABB())) return;

      const manifold = CollisionDetector.testCollision(a, b);
      if (!manifold) return;

      if (a.isTrigger || b.isTrigger) {
        const trigger = a.isTrigger ? a : b;
        const visitor = a.isTrigger ? b : a;
        overlaps.add(`${trigger.id}__${visitor.id}`);
        return;
      }

      manifolds.push(manifold);
    });

    this.solveManifolds(manifolds);
  }

  /** Velocity passes first, then positional passes that converge on the slop band. */
  public solveManifolds(manifolds: CollisionManifold[]): void {
    for (let i = 0; i < this.solverIterations; i++) {
      for (const m of manifolds) this.resolveVelocity(m, i === 0);
    }
    for (let i = 0; i < this.positionIterations; i++) {
      for (const m of manifolds) this.correctPosition(m);
    }
  }

  /** Single-manifold convenience wrapper (velocity + position). */
  public resolveCollision(m: CollisionManifold): void {
    this.resolveVelocity(m, true);
    this.correctPosition(m);
  }

  private resolveVelocity(m: CollisionManifold, allowRestitution: boolean): void {
    const a = m.bodyA as RigidBody;
    const b = m.bodyB as RigidBody;

    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass <= 0) return;

    const rv = Vec3Math.subtract(b.velocity, a.velocity);
    const velAlongNormal = Vec3Math.dot(rv, m.normal);
    if (velAlongNormal >= 0) return;

    // Restitution only on the first pass, and only for meaningful impacts.
    const e = allowRestitution && -velAlongNormal > this.restitutionThreshold
      ? Math.min(a.material.restitution, b.material.restitution)
      : 0;
    const impulseMag = (-(1 + e) * velAlongNormal) / totalInvMass;
    const impulse = Vec3Math.scale(m.normal, impulseMag);

    if (a.type === 'dynamic') {
      a.velocity.x -= impulse.x * a.invMass;
      a.velocity.y -= impulse.y * a.invMass;
      a.velocity.z -= impulse.z * a.invMass;
    }
    if (b.type === 'dynamic') {
      b.velocity.x += impulse.x * b.invMass;
      b.velocity.y += impulse.y * b.invMass;
      b.velocity.z += impulse.z * b.invMass;
    }

    // Coulomb friction along the contact tangent
    const tangent = Vec3Math.subtract(rv, Vec3Math.scale(m.normal, velAlongNormal));
    const tangentLen = Vec3Math.length(tangent);
    if (tangentLen <= 1e-4) return;

    const tangentDir = Vec3Math.scale(tangent, 1 / tangentLen);
    const frictionCoeff = Math.sqrt(a.material.friction * b.material.friction);
    const frictionImpulseMag = Math.min(frictionCoeff * impulseMag, tangentLen / totalInvMass);
    const frictionImpulse = Vec3Math.scale(tangentDir, frictionImpulseMag);

    if (a.type === 'dynamic') {
      a.velocity.x += frictionImpulse.x * a.invMass;
      a.velocity.y += frictionImpulse.y * a.invMass;
      a.velocity.z += frictionImpulse.z * a.invMass;
    }
    if (b.type === 'dynamic') {
      b.velocity.x -= frictionImpulse.x * b.invMass;
      b.velocity.y -= frictionImpulse.y * b.invMass;
      b.velocity.z -= frictionImpulse.z * b.invMass;
    }
  }

  private correctPosition(m: CollisionManifold): void {
    const a = m.bodyA as RigidBody;
    const b = m.bodyB as RigidBody;

    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass <= 0) return;

    // Depth is re-derived from the current transforms: resolving a neighbouring
    // contact can re-introduce overlap, and a stale depth would never see it.
    const fresh = CollisionDetector.testCollision(a, b);
    if (!fresh) return;

    const penetration = fresh.depth - this.linearSlop;
    if (penetration <= 0) return;

    const correctionMag = (penetration / totalInvMass) * this.baumgarte;
    const correction = Vec3Math.scale(fresh.normal, correctionMag);

    if (a.type === 'dynamic') {
      a.position.x -= correction.x * a.invMass;
      a.position.y -= correction.y * a.invMass;
      a.position.z -= correction.z * a.invMass;
      a.updateAABB();
    }
    if (b.type === 'dynamic') {
      b.position.x += correction.x * b.invMass;
      b.position.y += correction.y * b.invMass;
      b.position.z += correction.z * b.invMass;
      b.updateAABB();
    }
  }

  public raycast(
    origin: PhysicsVec3,
    direction: PhysicsVec3,
    maxDistance = 100,
    options?: RaycastOptions
  ): RaycastHit {
    let closestHit: RaycastHit = {
      hit: false,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      distance: maxDistance,
      bodyId: null
    };

    const bodiesList = this.list();
    if (!this.broadphase.isFresh(bodiesList)) this.broadphase.rebuild(bodiesList);

    const ignoreId = options?.ignoreBodyId ?? null;
    const includeTriggers = options?.includeTriggers === true;

    for (const body of this.broadphase.queryRay(origin, direction, maxDistance)) {
      if (body.id === ignoreId) continue;
      if (body.isTrigger && !includeTriggers) continue;

      const hit = CollisionDetector.raycastBody(origin, direction, body, maxDistance);
      if (hit.hit && hit.distance < closestHit.distance) {
        closestHit = hit;
      }
    }
    return closestHit;
  }

  private list(): RigidBody[] {
    if (!this.cachedList) this.cachedList = Array.from(this.bodies.values());
    return this.cachedList;
  }

  private emitTriggerEvent = (event: TriggerEvent): void => {
    for (const listener of this.triggerListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Trigger listener error:', err);
      }
    }
  };
}
