// Kinematic Character Controller with multi-probe ground detection, coyote time,
// jump buffering, ground snapping, and moving-platform riding.
// Ground probes ignore the character's own body, so contact is reported even
// when the capsule rests exactly on a surface without penetrating it.

import { PhysicsVec3 } from './types';
import { RigidBody } from './body';
import { PhysicsWorld } from './world';
import { Vec3Math } from './math';

export interface CharacterControllerConfig {
  walkSpeed?: number;
  sprintMultiplier?: number;
  jumpVelocity?: number;
  coyoteDurationSec?: number;
  jumpBufferSec?: number;
  groundRayLength?: number;
  groundSnapDistance?: number;
  /** cos(maxSlope): 0.7 is roughly a 45 degree walkable limit. */
  minGroundNormalY?: number;
}

const DOWN: PhysicsVec3 = { x: 0, y: -1, z: 0 };
const GROUND_SKIN = 0.05;
const PROBE_SPREAD = 0.6;

export class CharacterPhysicsController {
  public body: RigidBody;
  private world: PhysicsWorld;
  private config: Required<CharacterControllerConfig>;

  private isGrounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private standingOnBodyId: string | null = null;
  private spawnPoint: PhysicsVec3;
  private facingAngle = 0;

  constructor(body: RigidBody, world: PhysicsWorld, config?: CharacterControllerConfig) {
    this.body = body;
    this.world = world;
    this.spawnPoint = Vec3Math.clone(body.position);
    this.config = {
      walkSpeed: config?.walkSpeed ?? 6.0,
      sprintMultiplier: config?.sprintMultiplier ?? 1.6,
      jumpVelocity: config?.jumpVelocity ?? 9.0,
      coyoteDurationSec: config?.coyoteDurationSec ?? 0.12,
      jumpBufferSec: config?.jumpBufferSec ?? 0.12,
      groundRayLength: config?.groundRayLength ?? 0.3,
      groundSnapDistance: config?.groundSnapDistance ?? 0.2,
      minGroundNormalY: config?.minGroundNormalY ?? 0.7
    };
  }

  public setSpawnPoint(pos: PhysicsVec3): void {
    this.spawnPoint = Vec3Math.clone(pos);
  }

  public respawn(): void {
    this.body.setPosition(this.spawnPoint.x, this.spawnPoint.y + 0.5, this.spawnPoint.z);
    this.body.setVelocity(0, 0, 0);
    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.standingOnBodyId = null;
  }

  public update(
    moveAxes: { x: number; y: number },
    wantsJump: boolean,
    isSprinting: boolean,
    dt: number,
    cameraYaw = 0
  ): void {
    this.checkGrounded(dt);

    // Compute desired horizontal velocity with camera-relative orientation
    const currentSpeed = isSprinting ? this.config.walkSpeed * this.config.sprintMultiplier : this.config.walkSpeed;
    const { vx: targetVx, vz: targetVz, facingAngle } = computeCameraRelativeVelocity(
      { forward: moveAxes.y, strafe: moveAxes.x },
      cameraYaw,
      currentSpeed
    );

    if (moveAxes.x !== 0 || moveAxes.y !== 0) {
      this.facingAngle = facingAngle;
    }

    // Responsive horizontal acceleration and ground friction
    const accelRate = this.isGrounded ? 18.0 : 6.0;
    this.body.velocity.x += (targetVx - this.body.velocity.x) * Math.min(1.0, accelRate * dt);
    this.body.velocity.z += (targetVz - this.body.velocity.z) * Math.min(1.0, accelRate * dt);

    // Platform riding: inherit moving platform velocity if standing on one
    if (this.isGrounded && this.standingOnBodyId) {
      const platform = this.world.getBody(this.standingOnBodyId);
      if (platform && platform.type === 'kinematic') {
        this.body.position.x += platform.velocity.x * dt;
        this.body.position.y += platform.velocity.y * dt;
        this.body.position.z += platform.velocity.z * dt;
        this.body.updateAABB();
      }
    }

    // Jump handling with coyote time and input buffering
    this.jumpBufferTimer = wantsJump
      ? this.config.jumpBufferSec
      : Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && (this.isGrounded || this.coyoteTimer > 0)) {
      this.body.velocity.y = this.config.jumpVelocity;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }
  }

  public applyJumpPadImpulse(verticalVelocity = 18.0): void {
    this.body.velocity.y = verticalVelocity;
    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  public getGrounded(): boolean {
    return this.isGrounded;
  }

  public getPosition(): PhysicsVec3 {
    return this.body.position;
  }

  public getFacingAngle(): number {
    return this.facingAngle;
  }

  public setFacingAngle(angle: number): void {
    this.facingAngle = angle;
  }

  private halfHeight(): number {
    if (this.body.shape.type === 'box') return this.body.shape.halfExtents.y;
    if (this.body.shape.type === 'sphere') return this.body.shape.radius;
    if (this.body.shape.type === 'cylinder') return this.body.shape.halfHeight;
    return 1.0;
  }

  private horizontalRadius(): number {
    if (this.body.shape.type === 'box') {
      return Math.max(this.body.shape.halfExtents.x, this.body.shape.halfExtents.z);
    }
    if (this.body.shape.type === 'sphere') return this.body.shape.radius;
    if (this.body.shape.type === 'cylinder') return this.body.shape.radius;
    return 1.0;
  }

  /** Highest walkable surface under the five probe points, or null. */
  private probeGround(extraLength = 0): { bodyId: string | null; distance: number } | null {
    const pos = this.body.position;
    const originY = pos.y - this.halfHeight() + GROUND_SKIN;
    const spread = this.horizontalRadius() * PROBE_SPREAD;
    const maxDist = this.config.groundRayLength + GROUND_SKIN + extraLength;
    const offsets: Array<[number, number]> = [
      [0, 0],
      [spread, 0],
      [-spread, 0],
      [0, spread],
      [0, -spread]
    ];

    let best: { bodyId: string | null; distance: number } | null = null;
    for (const [ox, oz] of offsets) {
      const hit = this.world.raycast(
        { x: pos.x + ox, y: originY, z: pos.z + oz },
        DOWN,
        maxDist,
        { ignoreBodyId: this.body.id }
      );
      if (!hit.hit || hit.bodyId === this.body.id) continue;
      if (hit.normal.y < this.config.minGroundNormalY) continue;
      if (!best || hit.distance < best.distance) {
        best = { bodyId: hit.bodyId, distance: hit.distance };
      }
    }
    return best;
  }

  private checkGrounded(dt: number): void {
    const rising = this.body.velocity.y > 0.1;
    const contact = this.probeGround();

    if (contact && !rising) {
      this.stand(contact.bodyId);
      return;
    }

    // Walking off a small ledge: snap down instead of going airborne for a frame.
    if (!rising && this.snapToGround()) return;

    this.isGrounded = false;
    this.standingOnBodyId = null;
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
  }

  private snapToGround(): boolean {
    const contact = this.probeGround(this.config.groundSnapDistance);
    if (!contact) return false;

    const drop = contact.distance - (this.config.groundRayLength + GROUND_SKIN);
    if (drop <= 0) {
      this.stand(contact.bodyId);
      return true;
    }
    if (drop > this.config.groundSnapDistance) return false;

    this.body.position.y -= drop;
    this.body.velocity.y = 0;
    this.body.updateAABB();
    this.stand(contact.bodyId);
    return true;
  }

  private stand(bodyId: string | null): void {
    this.isGrounded = true;
    this.standingOnBodyId = bodyId;
    this.coyoteTimer = this.config.coyoteDurationSec;
  }
}

export function computeCameraRelativeVelocity(
  input: { forward: number; strafe: number },
  cameraYawRadians: number,
  moveSpeed = 6.0
): { vx: number; vz: number; facingAngle: number } {
  const sinYaw = Math.sin(cameraYawRadians);
  const cosYaw = Math.cos(cameraYawRadians);

  const worldX = input.strafe * cosYaw + input.forward * sinYaw;
  const worldZ = -input.strafe * sinYaw + input.forward * cosYaw;

  const length = Math.hypot(worldX, worldZ);
  if (length === 0) {
    return { vx: 0, vz: 0, facingAngle: 0 };
  }

  const vx = (worldX / length) * moveSpeed;
  const vz = (worldZ / length) * moveSpeed;
  const facingAngle = Math.atan2(worldX, worldZ);

  return { vx, vz, facingAngle };
}
