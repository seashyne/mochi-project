// Mounts the three advanced authoring features into any runtime host (playtest,
// published player). Terrain contributes colliders, constraints register with the
// physics solver, and particle emitters need a per-frame tick.

import * as THREE from 'three';
import type { PhysicsWorld } from '../physics';
import type { PhysicsConstraint } from '../physics/constraints';
import { normalizeConstraint, normalizeParticle } from './advancedTypes';
import { ParticleEmitter } from './particleSystem';
import { buildTerrainBodies } from './terrainBodies';
import type { StudioObject } from './types';

export class AdvancedFeatureRuntime {
  private bodyIds: string[] = [];
  private constraintIds: string[] = [];
  private emitters: ParticleEmitter[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld
  ) {}

  /** Idempotent: safe to call again when chunked streaming changes the object set. */
  mount(objects: StudioObject[]): void {
    this.unmount();
    for (const obj of objects) {
      if (obj.type === 'terrain' && obj.terrain) {
        for (const body of buildTerrainBodies(obj)) {
          // Chunk streaming may already have registered this exact collider id.
          if (this.physics.getBody(body.id)) continue;
          this.physics.addBody(body);
          this.bodyIds.push(body.id);
        }
      }
      if (obj.type === 'constraint' && obj.constraint) {
        const def = normalizeConstraint(obj.constraint);
        if (!def || !def.attachment0 || !def.attachment1) continue;
        const constraint: PhysicsConstraint = {
          id: `joint_${obj.id}`,
          kind: def.kind,
          bodyAId: def.attachment0,
          bodyBId: def.attachment1,
          stiffness: def.stiffness,
          damping: def.damping,
          restLength: def.restLength,
          axis: def.axis,
          anchor: null
        };
        this.physics.addConstraint(constraint);
        this.constraintIds.push(constraint.id);
      }
      if (obj.type === 'particle' && obj.particle) {
        this.emitters.push(new ParticleEmitter(obj, normalizeParticle(obj.particle), this.scene));
      }
    }
  }

  update(dt: number): void {
    for (const emitter of this.emitters) emitter.update(dt);
  }

  get mountedCount(): number {
    return this.bodyIds.length + this.constraintIds.length + this.emitters.length;
  }

  get emitterCount(): number {
    return this.emitters.length;
  }

  private unmount(): void {
    for (const id of this.bodyIds) this.physics.removeBody(id);
    for (const id of this.constraintIds) this.physics.removeConstraint(id);
    for (const emitter of this.emitters) emitter.dispose();
    this.bodyIds = [];
    this.constraintIds = [];
    this.emitters = [];
  }

  dispose(): void {
    this.unmount();
  }
}
