// Waypoint follower for scripted player movement.
//
// The pathfinder decides the route; this class decides the pace. It moves the
// player along the waypoints at a fixed speed, consuming several waypoints in a
// single tick when the frame is long, and never overshoots the last one.

import { arrive } from '../navigation/steering';

export interface WorldWaypoint {
  x: number;
  z: number;
}

/** The only surface a waypoint follower needs, so agents and the player share it. */
export interface NavigableBody {
  getPosition(): { x: number; y: number; z: number };
  setPosition(x: number, y: number, z: number): void;
}

export const DEFAULT_MOVE_SPEED = 4;
// Seconds the walk spends slowing into its final waypoint.
const DECEL_TIME = 0.35;

export class PlayerNavigator {
  private waypoints: WorldWaypoint[] = [];
  private index = 0;
  private speed = DEFAULT_MOVE_SPEED;

  constructor(private readonly player: NavigableBody) {}

  get isActive(): boolean {
    return this.waypoints.length > 0;
  }

  /** Returns false when the route is empty; the caller already failed earlier. */
  begin(waypoints: WorldWaypoint[], speed?: number): boolean {
    if (waypoints.length === 0) return false;
    this.waypoints = [...waypoints];
    this.index = 0;
    const requested = Number(speed);
    this.speed = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_MOVE_SPEED;
    return true;
  }

  stop(): void {
    this.waypoints = [];
    this.index = 0;
  }

  update(dt: number): void {
    if (this.waypoints.length === 0) return;

    const position = { ...this.player.getPosition() };
    // Cruise at full speed, then ease into the last waypoint instead of
    // stopping dead. The floor keeps the approach from converging to zero
    // short of the goal (Zeno).
    const goal = this.waypoints[this.waypoints.length - 1];
    const desired = arrive(position, goal, this.speed, this.speed * DECEL_TIME);
    const desiredSpeed = Math.hypot(desired.x, desired.z);
    const minSpeed = Math.max(this.speed * 0.3, 0.5);
    const cruise = Math.min(Math.max(desiredSpeed, minSpeed), this.speed);
    let budget = cruise * Math.max(dt, 0);

    while (budget > 0 && this.index < this.waypoints.length) {
      const target = this.waypoints[this.index];
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);

      if (distance <= budget) {
        position.x = target.x;
        position.z = target.z;
        budget -= distance;
        this.index += 1;
      } else if (distance > 0) {
        position.x += (dx / distance) * budget;
        position.z += (dz / distance) * budget;
        budget = 0;
      } else {
        this.index += 1;
      }
    }

    this.player.setPosition(position.x, position.y, position.z);
    if (this.index >= this.waypoints.length) this.stop();
  }
}
