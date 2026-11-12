// Distance/anchor constraint solver. Runs once per physics substep before contact
// resolution so joints stay tight when the iterative solver pushes bodies apart.

import type { ConstraintKind } from '../studio/advancedTypes';
import { RigidBody } from './body';
import { PhysicsVec3 } from './types';

export interface PhysicsConstraint {
  id: string;
  kind: ConstraintKind;
  bodyAId: string;
  bodyBId: string;
  stiffness: number;
  damping: number;
  restLength: number;
  axis: PhysicsVec3;
  /** Captured rest offset for weld/hinge; null until the first solve. */
  anchor: PhysicsVec3 | null;
}

/** Loader-prefixed body ids (sceneBodies) and raw ids (nodeFactory) both resolve. */
export function resolveConstraintBody(
  bodies: Map<string, RigidBody>,
  id: string
): RigidBody | undefined {
  return bodies.get(id) ?? bodies.get(`physics_${id}`) ?? bodies.get(`trigger_${id}`);
}

export class ConstraintSolver {
  private readonly constraints = new Map<string, PhysicsConstraint>();

  add(constraint: PhysicsConstraint): void {
    this.constraints.set(constraint.id, constraint);
  }

  remove(id: string): void {
    this.constraints.delete(id);
  }

  clear(): void {
    this.constraints.clear();
  }

  list(): PhysicsConstraint[] {
    return Array.from(this.constraints.values());
  }

  solve(bodies: Map<string, RigidBody>, _dt: number): void {
    for (const constraint of this.constraints.values()) {
      this.solveOne(constraint, bodies);
    }
  }

  private solveOne(c: PhysicsConstraint, bodies: Map<string, RigidBody>): void {
    const a = resolveConstraintBody(bodies, c.bodyAId);
    const b = resolveConstraintBody(bodies, c.bodyBId);
    if (!a || !b || a === b) return;
    const total = a.invMass + b.invMass;
    if (total <= 0) return;

    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const dist = Math.hypot(dx, dy, dz) || 1e-6;

    if ((c.kind === 'weld' || c.kind === 'hinge') && !c.anchor) {
      c.anchor = { x: dx, y: dy, z: dz };
    }

    let ex = 0;
    let ey = 0;
    let ez = 0;

    if (c.kind === 'weld' || c.kind === 'hinge') {
      const anchor = c.anchor!;
      ex = dx - anchor.x;
      ey = dy - anchor.y;
      ez = dz - anchor.z;
      if (c.kind === 'hinge') {
        const len = Math.hypot(c.axis.x, c.axis.y, c.axis.z);
        if (len > 1e-6) {
          const ax = c.axis.x / len;
          const ay = c.axis.y / len;
          const az = c.axis.z / len;
          const along = ex * ax + ey * ay + ez * az;
          ex -= along * ax;
          ey -= along * ay;
          ez -= along * az;
        }
      }
    } else {
      const error = dist - c.restLength;
      if (c.kind === 'rope' && error <= 0) return;
      const scale = error / dist;
      ex = dx * scale;
      ey = dy * scale;
      ez = dz * scale;
    }

    const gain = Math.min(1, Math.max(0, c.kind === 'spring' ? c.stiffness * 0.35 : c.stiffness));
    const wa = a.invMass / total;
    const wb = b.invMass / total;

    if (a.type === 'dynamic') {
      a.position.x += ex * wa * gain;
      a.position.y += ey * wa * gain;
      a.position.z += ez * wa * gain;
      a.updateAABB();
    }
    if (b.type === 'dynamic') {
      b.position.x -= ex * wb * gain;
      b.position.y -= ey * wb * gain;
      b.position.z -= ez * wb * gain;
      b.updateAABB();
    }

    if (c.damping <= 0) return;
    const errLen = Math.hypot(ex, ey, ez);
    if (errLen <= 1e-6) return;
    const nx = ex / errLen;
    const ny = ey / errLen;
    const nz = ez / errLen;
    const rel = (b.velocity.x - a.velocity.x) * nx
      + (b.velocity.y - a.velocity.y) * ny
      + (b.velocity.z - a.velocity.z) * nz;
    const impulse = rel * c.damping * gain;
    if (a.type === 'dynamic') {
      a.velocity.x += nx * impulse * wa;
      a.velocity.y += ny * impulse * wa;
      a.velocity.z += nz * impulse * wa;
    }
    if (b.type === 'dynamic') {
      b.velocity.x -= nx * impulse * wb;
      b.velocity.y -= ny * impulse * wb;
      b.velocity.z -= nz * impulse * wb;
    }
  }
}
